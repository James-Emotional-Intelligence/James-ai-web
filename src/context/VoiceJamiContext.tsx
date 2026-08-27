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
  sessionDuration: number;
  privacyMode: 'browser_web_speech' | 'wasm_local' | 'openai_realtime';
  lastTranscript: string;
  lastReply: string;
  pendingProposal: ActionProposal | null;
  errorMessage: string | null;
  enableHandsFree: () => Promise<void>;
  disableHandsFree: () => void;
  confirmProposal: (decision?: 'confirm' | 'reject') => Promise<void>;
  cancelCurrentTurn: () => void;
  sendManualCommand: (text: string) => Promise<void>;
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

  // Audio & Hardware References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const sessionTimerRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const lastWakeTimeRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  const currentTurnIdRef = useRef<string>('');

  // Audio element initialization for WebRTC remote output
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    remoteAudioElementRef.current = audio;

    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, []);

  // Session Duration Timer
  useEffect(() => {
    if (isHandsFreeEnabled && state !== 'disabled') {
      sessionTimerRef.current = setInterval(() => {
        setSessionDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      setSessionDuration(0);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [isHandsFreeEnabled, state]);

  // Tab visibility suspension handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (state === 'armed' || state === 'listening_command') {
          setState('suspended');
        }
      } else {
        if (state === 'suspended' && isHandsFreeEnabled) {
          setState('armed');
          startWakeWordRecognizer();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state, isHandsFreeEnabled]);

  /**
   * Safe Text-to-Speech playback using SpeechSynthesis (fallback or prompt)
   */
  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!('speechSynthesis' in window)) {
        onEnd?.();
        return;
      }

      window.speechSynthesis.cancel();
      isSpeakingRef.current = true;

      // Temporarily pause wake recognition while speaking
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Pick Vietnamese voice if available
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.includes('vi') || v.name.includes('Vietnamese'));
      if (viVoice) utterance.voice = viVoice;

      utterance.onend = () => {
        isSpeakingRef.current = false;
        onEnd?.();
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  /**
   * Stop and cleanup all hardware tracks and connections
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

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
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
    setIsMicActive(false);
  }, []);

  /**
   * Disable Hands-free mode completely
   */
  const disableHandsFree = useCallback(() => {
    cleanupHardware();
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

      setState('thinking');
      setLastTranscript(commandText);

      try {
        const turnId = 'turn_' + Date.now();
        currentTurnIdRef.current = turnId;

        const res = await api.sendVoiceCommand(commandText, turnId, privacyMode);

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
          if (isHandsFreeEnabled) {
            setState('armed');
            startWakeWordRecognizer();
          } else {
            setState('disabled');
          }
        });
      } catch (err: any) {
        console.error('[VoiceJami] Error executing command:', err);
        setErrorMessage(err.message || 'Không thể xử lý câu lệnh.');
        setState('error');
        speakText('Jami gặp trục trặc khi kết nối, bạn thử lại nhé.', () => {
          setState('armed');
          startWakeWordRecognizer();
        });
      }
    },
    [privacyMode, isHandsFreeEnabled, navigate, speakText]
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
    if (!isHandsFreeEnabled || isSpeakingRef.current) return;

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
          // Restart with slight backoff
          setTimeout(() => {
            if (isHandsFreeEnabled && !isSpeakingRef.current && state === 'armed') {
              startWakeWordRecognizer();
            }
          }, 1000);
        }
      };

      recognizer.onend = () => {
        // Continuous auto-restart when armed and not speaking
        if (isHandsFreeEnabled && !isSpeakingRef.current && (state === 'armed' || state === 'disabled')) {
          setTimeout(() => {
            if (isHandsFreeEnabled && !isSpeakingRef.current) {
              try {
                recognizer.start();
              } catch {}
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
  }, [isHandsFreeEnabled, speakText, executeCommand, startCommandListening, disableHandsFree, state]);

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
      setIsMicActive(true);
      setIsHandsFreeEnabled(true);

      // 2. Check OpenAI Realtime Ephemeral Client Secret
      try {
        const sessionRes = await api.getRealtimeClientSecret();
        if (sessionRes.mode === 'openai_realtime' && sessionRes.clientSecret) {
          setPrivacyMode('openai_realtime');
        } else {
          setPrivacyMode('browser_web_speech');
        }
      } catch {
        setPrivacyMode('browser_web_speech');
      }

      // 3. Play greeting sound & initialize wake detection
      const greeting = 'Jami đã bật chế độ rảnh tay. Bạn chỉ cần gọi "Jami ơi" là Jami sẽ lắng nghe!';
      setLastReply(greeting);
      setState('speaking');

      speakText(greeting, () => {
        setState('armed');
        startWakeWordRecognizer();
      });
    } catch (err: any) {
      console.error('[VoiceJami] Permission denied or media error:', err);
      setErrorMessage('Không thể truy cập micro. Vui lòng cấp quyền micro để sử dụng Jami rảnh tay.');
      setState('error');
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
          if (isHandsFreeEnabled) {
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
    [pendingProposal, isHandsFreeEnabled, navigate, speakText, startWakeWordRecognizer]
  );

  /**
   * Cancel current turn and return to armed state
   */
  const cancelCurrentTurn = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPendingProposal(null);
    if (isHandsFreeEnabled) {
      setState('armed');
      startWakeWordRecognizer();
    } else {
      setState('disabled');
    }
  }, [isHandsFreeEnabled, startWakeWordRecognizer]);

  /**
   * Send a manual text command through the voice agent pipeline
   */
  const sendManualCommand = useCallback(
    async (text: string) => {
      await executeCommand(text);
    },
    [executeCommand]
  );

  return (
    <VoiceJamiContext.Provider
      value={{
        state,
        isHandsFreeEnabled,
        isMicActive,
        sessionDuration,
        privacyMode,
        lastTranscript,
        lastReply,
        pendingProposal,
        errorMessage,
        enableHandsFree,
        disableHandsFree,
        confirmProposal,
        cancelCurrentTurn,
        sendManualCommand,
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
      sessionDuration: 0,
      privacyMode: 'browser_web_speech' as const,
      lastTranscript: '',
      lastReply: '',
      pendingProposal: null,
      errorMessage: null,
      enableHandsFree: async () => {},
      disableHandsFree: () => {},
      confirmProposal: async () => {},
      cancelCurrentTurn: () => {},
      sendManualCommand: async () => {},
    };
  }
  return context;
};
