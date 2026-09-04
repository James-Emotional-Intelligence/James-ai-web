import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, JamiChatMessageItem } from '../lib/api-client';
import { isWakeWordDetected } from '../lib/wake-word';

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
  speak: (text: string, options?: { msgId?: string; onEnd?: () => void; rate?: number }) => void;
  stopSpeaking: () => void;
}

const VoiceJamiContext = createContext<VoiceJamiContextType | null>(null);

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

  // Audio & Hardware References
  const mediaStreamRef = useRef<MediaStream | null>(null);
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

  /**
   * Unified Text-to-Speech Engine using SpeechSynthesis
   */
  const speak = useCallback(
    (text: string, options?: { msgId?: string; onEnd?: () => void; rate?: number }) => {
      if (!('speechSynthesis' in window)) {
        options?.onEnd?.();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Clean markdown, symbols, and code blocks for crisp speech
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_#~>[\]]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      if (!cleanText) {
        options?.onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.rate = options?.rate || 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.startsWith('vi') || v.name.includes('Vietnamese'));
      if (viVoice) {
        utterance.voice = viVoice;
      }

      utterance.onstart = () => {
        if (isMountedRef.current) {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          setSpeakingMessageId(options?.msgId || null);
          setCurrentUtteranceText(cleanText);
        }
      };

      utterance.onend = () => {
        if (isMountedRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setCurrentUtteranceText('');
        }
        options?.onEnd?.();
      };

      utterance.onerror = () => {
        if (isMountedRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setCurrentUtteranceText('');
        }
        options?.onEnd?.();
      };

      // Workaround for Chrome SpeechSynthesis pause bug
      const resumeInterval = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearInterval(resumeInterval);
        }
      }, 5000);

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setSpeakingMessageId(null);
    setCurrentUtteranceText('');
  }, []);

  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      speak(text, { onEnd });
    },
    [speak]
  );

  /**
   * Release hardware resources cleanly
   */
  const cleanupHardware = useCallback(() => {
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

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }

    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
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

  /**
   * Disable Hands-free mode completely
   */
  const disableHandsFree = useCallback(() => {
    cleanupHardware();
    isHandsFreeRef.current = false;
    setIsHandsFreeEnabled(false);
    setState('disabled');
    setPendingProposal(null);
    setErrorMessage(null);
  }, [cleanupHardware]);

  /**
   * Execute voice command through backend API and handle actions / proposals
   */
  const executeCommand = useCallback(
    async (commandText: string) => {
      if (!commandText.trim()) {
        setState('armed');
        startWakeWordRecognizer();
        return;
      }

      // Strip wake-word prefixes if user said "Jami ơi mở bài học"
      let cleanCmd = commandText
        .replace(/^(ơi\s+jami|jami\s+ơi|chào\s+jami|hey\s+jami|jami|em\s+ơi\s+jami)[,.\s]*/i, '')
        .trim();
      if (!cleanCmd) cleanCmd = commandText.trim();

      setState('thinking');
      setLastTranscript(cleanCmd);

      // Abort previous command in flight
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      try {
        const turnId = 'turn_' + Date.now();
        currentTurnIdRef.current = turnId;

        const res = await api.sendVoiceCommand(cleanCmd, turnId, privacyMode, undefined, abortController.signal);

        // If aborted while waiting for server
        if (abortController.signal.aborted) return;

        setLastReply(res.replyText);

        // If action includes a client navigation or focus timer
        if (res.clientAction) {
          if (res.clientAction.type === 'navigate' && res.clientAction.route) {
            navigate(res.clientAction.route);
          } else if (res.clientAction.type === 'focus_timer') {
            navigate('/focus');
          }
        }

        // If action requires user confirmation
        if (res.requiresConfirmation && res.proposal) {
          setPendingProposal(res.proposal);
          setState('confirmation_pending');
          speakText(res.replyText, () => {
            // After speaking confirmation question, start listening for "Đồng ý" / "Hủy"
            startCommandListening();
          });
          return;
        }

        // Normal response speech
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
          // User aborted/cancelled turn, return silently
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

  /**
   * Starts listening for user's command after wake word is detected
   */
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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }

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

        // Reset silence timer on speech activity
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          recognizer.stop();
        }, 2200);
      };

      recognizer.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('[VoiceJami] Command recognition error:', event.error);
        }
      };

      recognizer.onend = () => {
        if (finalCommand.trim()) {
          executeCommand(finalCommand.trim());
        } else {
          // If silence, re-arm wake word detector
          setState('armed');
          startWakeWordRecognizer();
        }
      };

      recognizer.start();

      // Fallback max command timeout: 8 seconds
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try {
          recognizer.stop();
        } catch {}
      }, 8000);
    } catch (err: any) {
      console.warn('[VoiceJami] Failed to start command recognizer:', err);
      setState('armed');
      startWakeWordRecognizer();
    }
  }, [executeCommand]);

  /**
   * Continuous Wake Word Recognizer ("Jami ơi")
   */
  const startWakeWordRecognizer = useCallback(() => {
    if (!isHandsFreeRef.current || isSpeakingRef.current) return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setPrivacyMode('browser_web_speech');
      return;
    }

    try {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }

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
            // Debounce duplicate wake detections within 2.5 seconds
            if (now - lastWakeTimeRef.current < 2500) {
              return;
            }
            lastWakeTimeRef.current = now;

            try {
              recognizer.stop();
            } catch {}

            setState('wake_detected');
            setLastTranscript(wakeCheck.wakePhrase || 'Jami ơi');

            // Robot immediately replies "Jami đang nghe đây"
            const wakeReply = 'Jami đang nghe đây';
            setLastReply(wakeReply);

            speakText(wakeReply, () => {
              // If user spoke the command in the same breath (e.g. "Jami ơi mở lịch học")
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
        if (event.error === 'not-allowed') {
          setErrorMessage('Quyền micro bị từ chối.');
          disableHandsFree();
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
        // Continuous auto-restart when hands-free is enabled, not speaking, and tab is visible
        if (isHandsFreeRef.current && !isSpeakingRef.current && !document.hidden) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isHandsFreeRef.current && !isSpeakingRef.current && !document.hidden) {
              try {
                recognizer.start();
              } catch {
                startWakeWordRecognizer();
              }
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
  }, [speakText, executeCommand, startCommandListening, disableHandsFree]);

  /**
   * User Gesture: Enable Hands-Free mode & acquire microphone permission
   */
  const enableHandsFree = useCallback(async () => {
    setState('requesting_permission');
    setErrorMessage(null);

    try {
      // 1. Explicit user gesture requesting microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      isHandsFreeRef.current = true;
      setIsMicActive(true);
      setIsHandsFreeEnabled(true);

      // 2. Attempt Genuine OpenAI Realtime WebRTC Negotiation
      let webrtcConnected = false;
      if (typeof RTCPeerConnection !== 'undefined') {
        try {
          setState('connecting');
          const pc = new RTCPeerConnection();
          peerConnectionRef.current = pc;

          // Remote audio element for AI model speech output
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          remoteAudioElementRef.current = audioEl;

          pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
              audioEl.srcObject = event.streams[0];
            }
          };

          // Add microphone tracks to peer connection
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          // Open data channel for Realtime events
          const dc = pc.createDataChannel('oai-events');
          dataChannelRef.current = dc;

          dc.onopen = () => {
            console.log('[VoiceJami WebRTC] oai-events data channel open');
          };

          dc.onmessage = (e) => {
            try {
              const event = JSON.parse(e.data);
              if (
                event.type === 'response.output_audio_transcript.delta' ||
                event.type === 'response.audio_transcript.delta'
              ) {
                setLastReply((prev) => prev + (event.delta || ''));
              } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
                if (event.transcript) {
                  setLastTranscript(event.transcript);
                }
              } else if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.done') {
                setState('armed');
              } else if (event.type === 'error') {
                console.warn('[VoiceJami WebRTC] OpenAI Realtime error event:', event.error);
              }
            } catch {}
          };

          // Create local offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          if (offer.sdp) {
            const sdpRes = await api.sendRealtimeSdpOffer(offer.sdp);
            if (sdpRes.mode === 'openai_realtime' && sdpRes.sdpAnswer) {
              await pc.setRemoteDescription({ type: 'answer', sdp: sdpRes.sdpAnswer });
              setPrivacyMode('openai_realtime');
              webrtcConnected = true;
              setState('armed');
            }
          }
        } catch (webrtcErr) {
          console.warn('[VoiceJami WebRTC] WebRTC connection could not be established, falling back to Browser Web Speech:', webrtcErr);
          if (peerConnectionRef.current) {
            try {
              peerConnectionRef.current.close();
            } catch {}
            peerConnectionRef.current = null;
          }
        }
      }

      if (!webrtcConnected) {
        setPrivacyMode('browser_web_speech');
      }

      // 3. Play greeting sound & initialize wake detection
      const greeting = webrtcConnected
        ? 'Jami đã kết nối trực tiếp với OpenAI Realtime. Bạn có thể trò chuyện trực tiếp hoặc nói "Jami ơi"!'
        : 'Jami đã bật chế độ rảnh tay (Giọng nói của trình duyệt). Bạn chỉ cần gọi "Jami ơi" là Jami sẽ lắng nghe!';
      setLastReply(greeting);
      setState('speaking');

      speakText(greeting, () => {
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

  /**
   * Confirm or reject pending action proposal
   */
  const confirmProposal = useCallback(
    async (decision: 'confirm' | 'reject' = 'confirm') => {
      if (!pendingProposal) return;
      setState('executing');

      try {
        const res = await api.confirmVoiceProposal(decision, pendingProposal.id);
        setPendingProposal(null);
        setLastReply(res.message);

        if (res.clientAction?.route) {
          navigate(res.clientAction.route);
        }

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

  /**
   * Cancel current turn and return to armed state
   */
  const cancelCurrentTurn = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPendingProposal(null);
    if (isHandsFreeRef.current) {
      setState('armed');
      startWakeWordRecognizer();
    } else {
      setState('disabled');
    }
  }, [startWakeWordRecognizer]);

  /**
   * Send a manual text command through the voice agent pipeline
   */
  const sendManualCommand = useCallback(
    async (text: string) => {
      await executeCommand(text);
    },
    [executeCommand]
  );

  // Audio element initialization for WebRTC remote output
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

  // Session Duration Timer
  useEffect(() => {
    if (isHandsFreeEnabled && state !== 'disabled') {
      sessionTimerRef.current = setInterval(() => {
        if (isMountedRef.current) {
          setSessionDuration((prev) => prev + 1);
        }
      }, 1000);
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (isMountedRef.current) setSessionDuration(0);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [isHandsFreeEnabled, state]);

  // Tab visibility suspension handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Suspend microphone tracks and speech recognition when tab is hidden
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
        }
        if (state === 'armed' || state === 'listening_command') {
          if (speechRecognitionRef.current) {
            try {
              speechRecognitionRef.current.abort();
            } catch {}
          }
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          if (isMountedRef.current) {
            setState('suspended');
          }
        }
      } else {
        // Resume microphone tracks and re-arm when tab is visible again
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
        }
        if (state === 'suspended' && isHandsFreeRef.current) {
          if (isMountedRef.current) {
            setState('armed');
            startWakeWordRecognizer();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state, startWakeWordRecognizer]);

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
        remoteMediaStream: mediaStreamRef.current,
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
    // Return safe inert default context for standalone usage
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
