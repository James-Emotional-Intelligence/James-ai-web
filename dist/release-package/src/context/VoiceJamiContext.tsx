import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, JamiChatMessageItem } from '../lib/api-client';
import { isWakeWordDetected } from '../lib/wake-word';
import { SpeechLanguage } from '../lib/speech-language';
import { jamiTts } from '../lib/jami-tts';

export type VoiceState =
  | 'disabled'
  | 'requesting_permission'
  | 'armed'
  | 'wake_detected'
  | 'listening_command'
  | 'connecting'
  | 'thinking'
  | 'speaking'
  | 'confirmation_pending'
  | 'executing'
  | 'suspended'
  | 'error';

export interface ActionProposal {
  id: string;
  actionType: string;
  previewText: string;
  payload: any;
  status: string;
  expiresAt: string;
}

export interface VoiceJamiContextType {
  state: VoiceState;
  isHandsFreeEnabled: boolean;
  isMicActive: boolean;
  isSpeaking: boolean;
  speakingMessageId: string | null;
  currentUtteranceText: string;
  sessionDuration: number;
  privacyMode: 'browser_web_speech' | 'wasm_local' | 'openai_realtime';
  lastTranscript: string;
  lastReply: string;
  pendingProposal: ActionProposal | null;
  errorMessage: string | null;
  remoteAudioElement: HTMLAudioElement | null;
  remoteMediaStream: MediaStream | null;
  enableHandsFree: () => Promise<void>;
  disableHandsFree: () => void;
  confirmProposal: (decision?: 'confirm' | 'reject') => Promise<void>;
  cancelCurrentTurn: () => void;
  sendManualCommand: (text: string) => Promise<void>;
  speak: (text: string, options?: { msgId?: string; onEnd?: () => void; rate?: number; lang?: SpeechLanguage }) => void;
  stopSpeaking: () => void;
}

const VoiceJamiContext = createContext<VoiceJamiContextType | null>(null);

/**
 * Prime the browser's speech synthesis engine within a user gesture.
 * Calling this during a click handler prevents "not-allowed" autoplay policy
 * from blocking the first real utterance.
 */
function primeSpeechOutput(): void {
  if (!('speechSynthesis' in window)) return;
  // Resume if paused (Chrome sometimes suspends after tab switch)
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
  // Warm-up voice list synchronously (no await – must stay in gesture)
  window.speechSynthesis.getVoices();
}

export const VoiceJamiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();

  const [state, setState] = useState<VoiceState>('disabled');
  const [isHandsFreeEnabled, setIsHandsFreeEnabled] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [privacyMode, setPrivacyMode] = useState<'browser_web_speech' | 'wasm_local' | 'openai_realtime'>('browser_web_speech');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('Chào bạn! Nói "Jami ơi" khi bạn cần hỗ trợ.');
  const [pendingProposal, setPendingProposal] = useState<ActionProposal | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [currentUtteranceText, setCurrentUtteranceText] = useState<string>('');

  // ── Hardware / session refs ────────────────────────────────────────────────
  const mediaStreamRef = useRef<MediaStream | null>(null);          // local mic (permission probe only)
  const remoteMediaStreamRef = useRef<MediaStream | null>(null);    // OpenAI Realtime remote audio
  const speechRecognitionRef = useRef<any>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const sessionTimerRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isHandsFreeRef = useRef<boolean>(false);
  const lastWakeTimeRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const currentTurnIdRef = useRef<string>('');
  const activeUtteranceIdRef = useRef<number>(0);
  const activeRealtimeSessionIdRef = useRef<string | null>(null);
  const recognitionGenerationRef = useRef(0);
  const intentionalRecognitionStopRef = useRef(false);
  const privacyModeRef = useRef<'browser_web_speech' | 'wasm_local' | 'openai_realtime'>('browser_web_speech');
  const processedRealtimeEventIdsRef = useRef<Set<string>>(new Set());
  const processedRealtimeCallIdsRef = useRef<Set<string>>(new Set());
  const realtimeTranscriptBuffersRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    privacyModeRef.current = privacyMode;
  }, [privacyMode]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const stopCurrentRecognition = useCallback((intentional = true) => {
    intentionalRecognitionStopRef.current = intentional;
    recognitionGenerationRef.current += 1;
    const current = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (!current) return;
    try {
      current.onresult = null;
      current.onend = null;
      current.onerror = null;
      current.stop();
      current.abort();
    } catch {
      // SpeechRecognition can throw when already ended; safe to discard.
    }
  }, []);

  // Context owns microphone coordination; jamiTts owns every playback source.
  const speak = useCallback(
    (text: string, options?: { msgId?: string; onEnd?: () => void; rate?: number; lang?: SpeechLanguage }) => {
      stopCurrentRecognition(true);
      if (remoteAudioElementRef.current && !remoteAudioElementRef.current.paused) {
        remoteAudioElementRef.current.pause();
      }
      const currentSpeechId = ++activeUtteranceIdRef.current;
      setErrorMessage(null);
      setSpeakingMessageId(options?.msgId ?? null);
      setCurrentUtteranceText(text);
      void jamiTts.speak(text, { lang: options?.lang, rate: options?.rate }).then((result) => {
        if (activeUtteranceIdRef.current !== currentSpeechId || !isMountedRef.current) return;
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        setCurrentUtteranceText('');
        if (result.reason === 'error') setErrorMessage(result.error?.message || 'Không thể phát giọng nói.');
        if (result.reason !== 'cancelled') options?.onEnd?.();
      });
    },
    [stopCurrentRecognition]
  );

  useEffect(() => jamiTts.subscribe((snapshot) => {
    if (!isMountedRef.current) return;
    const speaking = snapshot.phase === 'speaking';
    isSpeakingRef.current = speaking;
    setIsSpeaking(speaking);
  }), []);

  const stopSpeaking = useCallback(() => {
    // Advance speech ID so all in-flight callbacks become no-ops
    activeUtteranceIdRef.current++;
    jamiTts.stop();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setSpeakingMessageId(null);
    setCurrentUtteranceText('');
  }, []);

  const speakText = useCallback(
    (text: string, onEnd?: () => void, lang?: SpeechLanguage) => {
      speak(text, { onEnd, lang });
    },
    [speak]
  );

  // ── Hardware cleanup ───────────────────────────────────────────────────────

  const cleanupHardware = useCallback(() => {
    activeUtteranceIdRef.current++;
    jamiTts.stop();

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current.abort();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (activeRealtimeSessionIdRef.current) {
      const sessId = activeRealtimeSessionIdRef.current;
      activeRealtimeSessionIdRef.current = null;
      api.finalizeRealtimeSession(sessId, { reason: 'Người dùng ngắt kết nối hoặc thoát chế độ thoại' }).catch(() => {});
    }

    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
      peerConnectionRef.current = null;
    }

    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch {}
      dataChannelRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setSpeakingMessageId(null);
    setIsMicActive(false);
  }, []);

  const disableHandsFree = useCallback(() => {
    cleanupHardware();
    isHandsFreeRef.current = false;
    setIsHandsFreeEnabled(false);
    setState('disabled');
    setPendingProposal(null);
    setErrorMessage(null);
  }, [cleanupHardware]);

  // ── Command execution ──────────────────────────────────────────────────────

  const executeCommand = useCallback(
    async (commandText: string) => {
      if (!commandText.trim()) {
        setState('armed');
        startWakeWordRecognizer();
        return;
      }

      let cleanCmd = commandText
        .replace(/^(ơi\s+jami|jami\s+ơi|chào\s+jami|hey\s+jami|jami|em\s+ơi\s+jami)[,.\s]*/i, '')
        .trim();
      if (!cleanCmd) cleanCmd = commandText.trim();

      setState('thinking');
      setLastTranscript(cleanCmd);

      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      try {
        const turnId = 'turn_' + Date.now();
        currentTurnIdRef.current = turnId;

        const res = await api.sendVoiceCommand(cleanCmd, turnId, privacyMode, undefined, abortController.signal);

        if (abortController.signal.aborted) return;

        setLastReply(res.replyText);

        if (res.clientAction) {
          if (res.clientAction.type === 'navigate' && res.clientAction.route) {
            navigate(res.clientAction.route);
          } else if (res.clientAction.type === 'focus_timer') {
            navigate('/focus');
          }
        }

        if (res.requiresConfirmation && res.proposal) {
          setPendingProposal(res.proposal);
          setState('confirmation_pending');
          speakText(res.replyText, () => {
            startCommandListening();
          });
          return;
        }

        setState('speaking');
        speakText(res.replyText, () => {
          if (isHandsFreeRef.current && !document.hidden) {
            setState('armed');
            startWakeWordRecognizer();
          } else {
            setState('disabled');
          }
        });
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          if (isHandsFreeRef.current && !document.hidden) {
            setState('armed');
            startWakeWordRecognizer();
          } else {
            setState('disabled');
          }
          return;
        }
        console.error('[VoiceJami] Error executing command:', err);
        setErrorMessage(err.message || 'Không thể xử lý câu lệnh.');
        setState('error');
        speakText('Jami gặp trục trặc khi kết nối, bạn thử lại nhé.', () => {
          if (isHandsFreeRef.current && !document.hidden) {
            setState('armed');
            startWakeWordRecognizer();
          }
        });
      }
    },
    [privacyMode, navigate, speakText]
  );

  // ── Command listening ──────────────────────────────────────────────────────

  const startCommandListening = useCallback(() => {
    setState('listening_command');
    setErrorMessage(null);

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorMessage('Trình duyệt không hỗ trợ Web Speech API.');
      setState('error');
      return;
    }

    try {
      stopCurrentRecognition(true);
      intentionalRecognitionStopRef.current = false;
      const generation = ++recognitionGenerationRef.current;
      const recognizer = new SpeechRecognitionClass();
      recognizer.lang = 'vi-VN';
      recognizer.continuous = false;
      recognizer.interimResults = true;
      speechRecognitionRef.current = recognizer;

      let finalCommand = '';

      recognizer.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalCommand += transcript;
          } else {
            interim += transcript;
          }
        }
        setLastTranscript(finalCommand || interim);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => { recognizer.stop(); }, 2200);
      };

      recognizer.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('[VoiceJami] Command recognition error:', event.error);
        }
      };

      recognizer.onend = () => {
        if (generation !== recognitionGenerationRef.current || speechRecognitionRef.current !== recognizer) return;
        speechRecognitionRef.current = null;
        if (finalCommand.trim()) {
          executeCommand(finalCommand.trim());
        } else {
          setState('armed');
          startWakeWordRecognizer();
        }
      };

      recognizer.start();

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try { recognizer.stop(); } catch {}
      }, 8000);
    } catch (err: any) {
      console.warn('[VoiceJami] Failed to start command recognizer:', err);
      setState('armed');
      startWakeWordRecognizer();
    }
  }, [executeCommand, stopCurrentRecognition]);

  // ── Wake word recognizer ───────────────────────────────────────────────────

  const startWakeWordRecognizer = useCallback(() => {
    if (!isHandsFreeRef.current || isSpeakingRef.current || privacyModeRef.current === 'openai_realtime') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setPrivacyMode('browser_web_speech');
      return;
    }

    try {
      stopCurrentRecognition(true);
      intentionalRecognitionStopRef.current = false;
      const generation = ++recognitionGenerationRef.current;
      const recognizer = new SpeechRecognitionClass();
      recognizer.lang = 'vi-VN';
      recognizer.continuous = true;
      recognizer.interimResults = true;
      speechRecognitionRef.current = recognizer;

      recognizer.onresult = (event: any) => {
        if (isSpeakingRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const rawTranscript = event.results[i][0].transcript;
          const wakeCheck = isWakeWordDetected(rawTranscript);

          if (wakeCheck.matched) {
            const now = Date.now();
            if (now - lastWakeTimeRef.current < 2500) return;
            lastWakeTimeRef.current = now;

            stopCurrentRecognition(true);
            setState('wake_detected');
            setLastTranscript(wakeCheck.wakePhrase || 'Jami ơi');

            const wakeReply = 'Jami đang nghe đây';
            setLastReply(wakeReply);

            speakText(wakeReply, () => {
              if (wakeCheck.commandSnippet && wakeCheck.commandSnippet.length > 2) {
                executeCommand(wakeCheck.commandSnippet);
              } else {
                startCommandListening();
              }
            });
            return;
          }
        }
      };

      recognizer.onerror = (event: any) => {
        if (generation !== recognitionGenerationRef.current || speechRecognitionRef.current !== recognizer) return;
        if (event.error === 'not-allowed') {
          setErrorMessage('Quyền micro bị từ chối.');
          disableHandsFree();
        } else if (event.error === 'audio-capture' || event.error === 'service-not-allowed') {
          setErrorMessage('Không thể truy cập micro. Hãy kiểm tra quyền micro của trình duyệt.');
          setState('error');
          isHandsFreeRef.current = false;
          setIsHandsFreeEnabled(false);
        } else if (event.error !== 'no-speech') {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isHandsFreeRef.current && !isSpeakingRef.current && !document.hidden) {
              startWakeWordRecognizer();
            }
          }, 1000);
        }
      };

      recognizer.onend = () => {
        if (generation !== recognitionGenerationRef.current || speechRecognitionRef.current !== recognizer) return;
        speechRecognitionRef.current = null;
        if (isHandsFreeRef.current && !isSpeakingRef.current && !document.hidden) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isHandsFreeRef.current && !isSpeakingRef.current && !document.hidden) {
              startWakeWordRecognizer();
            }
          }, 300);
        }
      };

      recognizer.start();
      setState('armed');
      setIsMicActive(true);
    } catch (err: any) {
      console.warn('[VoiceJami] Could not start wake recognizer:', err);
    }
  }, [speakText, executeCommand, startCommandListening, disableHandsFree, stopCurrentRecognition]);

  // ── Enable Hands-Free ──────────────────────────────────────────────────────
  /**
   * Browser-Speech-only hands-free path.
   *
   * Architecture:
   *   1. getUserMedia() → proves the user granted mic permission
   *   2. Immediately stop that permission-probe stream (SpeechRecognition
   *      manages its own mic access)
   *   3. Prime TTS (within user gesture – prevents not-allowed autoplay)
   *   4. Speak greeting → then arm wake-word recognizer
   *
   * OpenAI Realtime is a separate function (startRealtimeSession) and is
   * intentionally NOT started here, so there is no dead code, no stopped-
   * stream reuse, and no two concurrent mic consumers.
   */
  const enableHandsFree = useCallback(async () => {
    setState('requesting_permission');
    setErrorMessage(null);

    // Prime TTS synchronously while still in user-gesture stack
    primeSpeechOutput();

    try {
      // Prove mic permission. We immediately stop this stream because
      // SpeechRecognition manages its own mic access internally.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      // Do NOT store stopped stream – it is useless after .stop()
      mediaStreamRef.current = null;

      isHandsFreeRef.current = true;
      setIsMicActive(true);
      setIsHandsFreeEnabled(true);
      setPrivacyMode('browser_web_speech');
      privacyModeRef.current = 'browser_web_speech';

      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        const msg = 'Trình duyệt này chưa hỗ trợ gọi Jami bằng từ khóa. Hãy dùng Chrome hoặc Edge.';
        setErrorMessage(msg);
        isHandsFreeRef.current = false;
        setIsHandsFreeEnabled(false);
        setIsMicActive(false);
        setState('error');
        speakText(msg);
        return;
      }

      setState('speaking');
      speakText('Jami đã bật chế độ rảnh tay. Bạn chỉ cần gọi Jami ơi.', () => {
        if (isHandsFreeRef.current) {
          setState('armed');
          startWakeWordRecognizer();
        }
      });
    } catch (err: any) {
      console.error('[VoiceJami] Permission denied or media error:', err);
      setErrorMessage('Không thể truy cập micro. Vui lòng cấp quyền micro để sử dụng Jami rảnh tay.');
      setState('error');
      isHandsFreeRef.current = false;
      setIsHandsFreeEnabled(false);
      setIsMicActive(false);
    }
  }, [speakText, startWakeWordRecognizer]);

  // ── OpenAI Realtime (isolated, not called from enableHandsFree) ────────────
  /**
   * Start a genuine OpenAI Realtime WebRTC session.
   * Acquires a FRESH getUserMedia() stream – never reuses a stopped stream.
   * Called explicitly if/when the app decides to use Realtime mode.
   */
  const startRealtimeSession = useCallback(async () => {
    if (typeof RTCPeerConnection === 'undefined') {
      console.warn('[VoiceJami Realtime] RTCPeerConnection not available');
      return;
    }

    try {
      setState('connecting');

      // Fresh stream – live tracks – for WebRTC peer connection
      const freshStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = freshStream;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Remote audio element for AI model speech output
      const audioEl = remoteAudioElementRef.current || new Audio();
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true; // valid runtime attr for mobile, not in TS lib
      audioEl.muted = false;
      audioEl.volume = 1;
      remoteAudioElementRef.current = audioEl;

      audioEl.onplay = () => {
        jamiTts.stop();
        if (isMountedRef.current) {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          setState('speaking');
        }
      };
      audioEl.onpause = () => {
        if (isMountedRef.current) { isSpeakingRef.current = false; setIsSpeaking(false); setState('armed'); }
      };
      audioEl.onended = () => {
        if (isMountedRef.current) { isSpeakingRef.current = false; setIsSpeaking(false); setState('armed'); }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          // Assign to REMOTE ref – not to local mic ref
          remoteMediaStreamRef.current = event.streams[0];
          audioEl.srcObject = event.streams[0];
          audioEl.play().catch((playErr) => {
            console.error('[VoiceJami Realtime] audio.play() rejected:', playErr);
            setErrorMessage('Âm thanh Jami bị trình duyệt chặn. Hãy bấm vào trang để bật âm thanh.');
          });
        }
      };

      // Add LIVE (not stopped) microphone tracks to peer connection
      freshStream.getTracks().forEach((track) => {
        if (track.readyState !== 'ended') {
          pc.addTrack(track, freshStream);
        }
      });

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => console.log('[VoiceJami WebRTC] oai-events data channel open');
      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          const eventId = event.event_id || event.id;
          if (eventId) {
            if (processedRealtimeEventIdsRef.current.has(eventId)) return;
            processedRealtimeEventIdsRef.current.add(eventId);
          }

          if (event.type === 'response.created' && event.response?.id) {
            realtimeTranscriptBuffersRef.current.set(event.response.id, '');
            setLastReply('');
          } else if (
            event.type === 'response.output_audio_transcript.delta' ||
            event.type === 'response.audio_transcript.delta'
          ) {
            jamiTts.stop();
            const responseId = event.response_id || event.response?.id || 'default';
            const nextValue = (realtimeTranscriptBuffersRef.current.get(responseId) || '') + (event.delta || '');
            realtimeTranscriptBuffersRef.current.set(responseId, nextValue);
            setLastReply(nextValue);
          } else if (event.type === 'response.done' && event.response?.id) {
            const finalText = realtimeTranscriptBuffersRef.current.get(event.response.id);
            if (finalText !== undefined) setLastReply(finalText);
          } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
            if (event.transcript) setLastTranscript(event.transcript);
          } else if (
            event.type === 'response.function_call_arguments.done' ||
            (event.type === 'response.output_item.done' && event.item?.type === 'function_call')
          ) {
            const call = event.item?.type === 'function_call' ? event.item : event;
            const toolName = call.name || event.name;
            const callId = call.call_id || event.call_id;
            const rawArgs = call.arguments || event.arguments;

            if (toolName && callId && activeRealtimeSessionIdRef.current) {
              const callKey = `${activeRealtimeSessionIdRef.current}:${callId}`;
              if (processedRealtimeCallIdsRef.current.has(callKey)) return;
              processedRealtimeCallIdsRef.current.add(callKey);
              api.executeRealtimeToolCall(activeRealtimeSessionIdRef.current, toolName, callId, rawArgs).then((result) => {
                if (result.proposal) { setPendingProposal(result.proposal); setState('confirmation_pending'); }
                if (result.clientAction?.route) navigate(result.clientAction.route);
                if (dc.readyState === 'open' && callId) {
                  dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) } }));
                  dc.send(JSON.stringify({ type: 'response.create' }));
                }
              }).catch((err) => {
                console.warn('[VoiceJami WebRTC] Tool execution failed:', err);
                if (dc.readyState === 'open' && callId) {
                  dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ success: false, error: err.message }) } }));
                  dc.send(JSON.stringify({ type: 'response.create' }));
                }
              });
            }
          } else if (event.type === 'response.output_audio_transcript.done') {
            // Transcript completion is not playback completion. The media
            // element's pause/ended events own the audible speaking state.
          } else if (event.type === 'error') {
            console.warn('[VoiceJami WebRTC] OpenAI Realtime error event:', event.error);
          }
        } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (offer.sdp) {
        const sdpRes = await api.sendRealtimeSdpOffer(offer.sdp);
        if (sdpRes.mode === 'openai_realtime' && sdpRes.sdpAnswer) {
          await pc.setRemoteDescription({ type: 'answer', sdp: sdpRes.sdpAnswer });
          activeRealtimeSessionIdRef.current = sdpRes.sessionId || null;
          processedRealtimeEventIdsRef.current.clear();
          processedRealtimeCallIdsRef.current.clear();
          realtimeTranscriptBuffersRef.current.clear();
          setPrivacyMode('openai_realtime');
          privacyModeRef.current = 'openai_realtime';
          setState('armed');
          return;
        }
      }

      // SDP negotiation failed – clean up
      throw new Error('SDP negotiation failed or server did not return openai_realtime mode');
    } catch (rtcErr) {
      console.warn('[VoiceJami Realtime] Session could not be established:', rtcErr);
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch {}
        peerConnectionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      remoteMediaStreamRef.current = null;
    }
  }, [navigate]);

  // ── Confirm/reject proposal ────────────────────────────────────────────────

  const confirmProposal = useCallback(
    async (decision: 'confirm' | 'reject' = 'confirm') => {
      if (!pendingProposal) return;
      setState('executing');

      try {
        const res = await api.confirmVoiceProposal(decision, pendingProposal.id);
        setPendingProposal(null);
        setLastReply(res.message);

        if (res.clientAction?.route) navigate(res.clientAction.route);

        setState('speaking');
        speakText(res.message, () => {
          if (isHandsFreeRef.current) {
            setState('armed');
            startWakeWordRecognizer();
          } else {
            setState('disabled');
          }
        });
      } catch (err: any) {
        setErrorMessage(err.message || 'Không thể xác nhận đề xuất.');
        setState('error');
      }
    },
    [pendingProposal, navigate, speakText, startWakeWordRecognizer]
  );

  // ── Cancel current turn ────────────────────────────────────────────────────

  const cancelCurrentTurn = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.abort(); } catch {}
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPendingProposal(null);
    if (isHandsFreeRef.current) {
      setState('armed');
      startWakeWordRecognizer();
    } else {
      setState('disabled');
    }
  }, [startWakeWordRecognizer]);

  const sendManualCommand = useCallback(
    async (text: string) => { await executeCommand(text); },
    [executeCommand]
  );

  // ── Effects ────────────────────────────────────────────────────────────────

  // Audio element for WebRTC remote output
  useEffect(() => {
    isMountedRef.current = true;
    const audio = new Audio();
    audio.autoplay = true;
    remoteAudioElementRef.current = audio;

    return () => {
      isMountedRef.current = false;
      cleanupHardware();
      audio.pause();
      audio.srcObject = null;
    };
  }, [cleanupHardware]);

  // Session duration timer
  useEffect(() => {
    if (isHandsFreeEnabled && state !== 'disabled') {
      sessionTimerRef.current = setInterval(() => {
        if (isMountedRef.current) setSessionDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (isMountedRef.current) setSessionDuration(0);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [isHandsFreeEnabled, state]);

  // Tab visibility suspension
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
        }
        if (state === 'armed' || state === 'listening_command') {
          if (speechRecognitionRef.current) {
            try { speechRecognitionRef.current.abort(); } catch {}
          }
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          if (isMountedRef.current) setState('suspended');
        }
      } else {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
        }
        if (state === 'suspended' && isHandsFreeRef.current && isMountedRef.current) {
          setState('armed');
          startWakeWordRecognizer();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state, startWakeWordRecognizer]);

  // ── Provider value ─────────────────────────────────────────────────────────

  return (
    <VoiceJamiContext.Provider
      value={{
        state,
        isHandsFreeEnabled,
        isMicActive,
        isSpeaking,
        speakingMessageId,
        currentUtteranceText,
        sessionDuration,
        privacyMode,
        lastTranscript,
        lastReply,
        pendingProposal,
        errorMessage,
        remoteAudioElement: remoteAudioElementRef.current,
        // ← remoteMediaStream is now the REMOTE OpenAI stream, not the local mic
        remoteMediaStream: remoteMediaStreamRef.current,
        enableHandsFree,
        disableHandsFree,
        confirmProposal,
        cancelCurrentTurn,
        sendManualCommand,
        speak,
        stopSpeaking,
      }}
    >
      {children}
    </VoiceJamiContext.Provider>
  );
};

export const useVoiceJamiOptional = () => {
  return useContext(VoiceJamiContext);
};

export const useVoiceJami = () => {
  const context = useContext(VoiceJamiContext);
  if (!context) {
    return {
      state: 'disabled' as VoiceState,
      isHandsFreeEnabled: false,
      isMicActive: false,
      isSpeaking: false,
      speakingMessageId: null,
      currentUtteranceText: '',
      sessionDuration: 0,
      privacyMode: 'browser_web_speech' as const,
      lastTranscript: '',
      lastReply: '',
      pendingProposal: null,
      errorMessage: null,
      remoteAudioElement: null,
      remoteMediaStream: null,
      enableHandsFree: async () => {},
      disableHandsFree: () => {},
      confirmProposal: async () => {},
      cancelCurrentTurn: () => {},
      sendManualCommand: async () => {},
      speak: () => {},
      stopSpeaking: () => {},
    };
  }
  return context;
};
