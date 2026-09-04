import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { useVoiceJami } from '../../context/VoiceJamiContext';
import {
  GreetingQuestionItem,
  getRandomGreetingQuestion,
} from './today-greetings';

export type GreetingConversationStatus = 'asking' | 'thinking' | 'replied' | 'error';

export interface UseTodayGreetingConversationResult {
  questionItem: GreetingQuestionItem;
  displayMessage: string;
  status: GreetingConversationStatus;
  answerText: string;
  setAnswerText: (text: string) => void;
  handleSubmit: (customAnswer?: string) => Promise<void>;
  handleRetry: () => Promise<void>;
  handleSkipOrDismiss: () => void;
  isThinking: boolean;
  hasReplied: boolean;
  errorMessage: string | null;
  // Voice Speech Recognition Features
  isListening: boolean;
  startListening: () => void;
  stopListening: (shouldSubmit?: boolean) => void;
  speechError: string | null;
  isSpeechSupported: boolean;
}

export interface UseTodayGreetingConversationOptions {
  isReady?: boolean;
}

export function useTodayGreetingConversation(
  studentName = 'bạn',
  options?: UseTodayGreetingConversationOptions
): UseTodayGreetingConversationResult {
  const isReady = options?.isReady ?? true;
  const [questionItem] = useState<GreetingQuestionItem>(() => getRandomGreetingQuestion());
  const [displayMessage, setDisplayMessage] = useState<string>(() => questionItem.question);
  const [status, setStatus] = useState<GreetingConversationStatus>('asking');
  const [answerText, setAnswerText] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const voiceContext = useVoiceJami();
  const voiceContextRef = useRef(voiceContext);
  voiceContextRef.current = voiceContext;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const hasSpokenQuestionRef = useRef(false);
  const submittedRef = useRef(false);
  const currentTranscriptRef = useRef('');
  const lastSubmittedAnswerRef = useRef('');
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  const isSpeechSupported = typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Clear timeout utility
  const clearFallbackTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Speak initial question ONLY when isReady is true (all page data has loaded)
  useEffect(() => {
    if (!isReady) return;
    if (!hasSpokenQuestionRef.current && voiceContextRef.current?.speak) {
      hasSpokenQuestionRef.current = true;
      try {
        voiceContextRef.current.speak(questionItem.question);
      } catch {}
    }
  }, [isReady, questionItem.question]);

  // Set 12-second timeout for fallback reply ONLY when not typing and not listening
  useEffect(() => {
    if (!isReady || status !== 'asking' || isListening || answerText.trim() !== '') {
      clearFallbackTimer();
      return;
    }

    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      // If user hasn't answered, transition to fallback reply
      setStatus('replied');
      setDisplayMessage(questionItem.fallbackReply);
      if (voiceContextRef.current?.speak) {
        try {
          voiceContextRef.current.speak(questionItem.fallbackReply);
        } catch {}
      }
    }, 12000);

    return () => {
      clearFallbackTimer();
    };
  }, [isReady, status, isListening, answerText, questionItem.fallbackReply, clearFallbackTimer]);

  const handleSubmit = useCallback(
    async (customAnswer?: string) => {
      clearFallbackTimer();
      setSpeechError(null);
      setErrorMessage(null);

      const textToSend = typeof customAnswer === 'string' ? customAnswer : answerText;
      const trimmed = textToSend.trim();

      if (!trimmed) {
        // If empty, show fallback reply
        setStatus('replied');
        setDisplayMessage(questionItem.fallbackReply);
        if (voiceContextRef.current?.speak) {
          voiceContextRef.current.speak(questionItem.fallbackReply);
        }
        return;
      }

      lastSubmittedAnswerRef.current = trimmed;
      submittedRef.current = true;
      setStatus('thinking');
      const currentReqId = ++requestSeqRef.current;

      try {
        const response = await api.sendJamiChat(
          `[Lời chào tương tác đầu ngày]\nCâu hỏi: "${questionItem.question}"\nHọc sinh (${studentName}) phản hồi: "${trimmed}"\nHãy phản hồi học sinh bằng 1-2 câu tiếng Việt ngắn gọn, ấm áp, khích lệ và truyền cảm hứng.`
        );

        if (!isMountedRef.current || requestSeqRef.current !== currentReqId) {
          return;
        }

        const reply = response.replyMessage?.text?.trim() || questionItem.fallbackReply;
        setDisplayMessage(reply);
        setStatus('replied');
        setAnswerText('');
        currentTranscriptRef.current = '';

        if (voiceContextRef.current?.speak) {
          voiceContextRef.current.speak(reply);
        }
      } catch (err: any) {
        if (!isMountedRef.current || requestSeqRef.current !== currentReqId) {
          return;
        }
        setStatus('error');
        setErrorMessage(err.message || 'Không thể kết nối đến Jami AI. Bạn có thể thử lại hoặc tiếp tục vào học.');
      }
    },
    [answerText, clearFallbackTimer, questionItem.question, questionItem.fallbackReply, studentName]
  );

  const handleRetry = useCallback(async () => {
    if (lastSubmittedAnswerRef.current) {
      await handleSubmit(lastSubmittedAnswerRef.current);
    } else {
      setStatus('asking');
    }
  }, [handleSubmit]);

  // Stop speech recognition utility
  const stopListening = useCallback((shouldSubmit = false) => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setIsListening(false);

    if (shouldSubmit && !submittedRef.current) {
      const finalVal = currentTranscriptRef.current || answerText;
      if (finalVal.trim()) {
        handleSubmit(finalVal.trim());
      }
    }
  }, [answerText, handleSubmit]);

  const startListening = useCallback(() => {
    clearFallbackTimer();
    setSpeechError(null);
    setErrorMessage(null);
    submittedRef.current = false;

    if (voiceContextRef.current?.isSpeaking) {
      voiceContextRef.current.stopSpeaking();
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setSpeechError('Trình duyệt chưa hỗ trợ nhận diện giọng nói. Vui lòng thử Chrome hoặc Edge.');
      return;
    }

    try {
      const recognizer = new SpeechRecognitionClass();
      recognizer.lang = 'vi-VN';
      recognizer.continuous = false;
      recognizer.interimResults = true;
      speechRecognitionRef.current = recognizer;

      recognizer.onstart = () => {
        if (isMountedRef.current) {
          setIsListening(true);
        }
      };

      recognizer.onresult = (event: any) => {
        let finalTranscript = '';
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans + ' ';
          } else {
            currentInterim += trans;
          }
        }
        const fullTranscript = (finalTranscript + currentInterim).trim();
        currentTranscriptRef.current = fullTranscript;
        if (isMountedRef.current) {
          setAnswerText(fullTranscript);
        }
      };

      recognizer.onerror = (event: any) => {
        if (event.error !== 'no-speech' && isMountedRef.current) {
          setSpeechError(`Lỗi micro (${event.error}). Vui lòng kiểm tra quyền truy cập micro.`);
        }
        if (isMountedRef.current) {
          setIsListening(false);
        }
      };

      recognizer.onend = () => {
        if (!isMountedRef.current) return;
        setIsListening(false);
        speechRecognitionRef.current = null;

        // If not already submitted and we have speech text, submit once
        if (!submittedRef.current) {
          const captured = (currentTranscriptRef.current || answerText).trim();
          if (captured) {
            handleSubmit(captured);
          }
        }
      };

      recognizer.start();
    } catch (err: any) {
      if (isMountedRef.current) {
        setSpeechError(err.message || 'Không thể khởi động micro');
        setIsListening(false);
      }
    }
  }, [answerText, clearFallbackTimer, handleSubmit]);

  const handleSkipOrDismiss = useCallback(() => {
    stopListening(false);
    clearFallbackTimer();
    setStatus('replied');
    setDisplayMessage(questionItem.fallbackReply);
    if (voiceContextRef.current?.speak) {
      voiceContextRef.current.speak(questionItem.fallbackReply);
    }
  }, [clearFallbackTimer, questionItem.fallbackReply, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearFallbackTimer();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }
    };
  }, [clearFallbackTimer]);

  return {
    questionItem,
    displayMessage,
    status,
    answerText,
    setAnswerText,
    handleSubmit,
    handleRetry,
    handleSkipOrDismiss,
    isThinking: status === 'thinking',
    hasReplied: status === 'replied',
    errorMessage,
    isListening,
    startListening,
    stopListening,
    speechError,
    isSpeechSupported,
  };
}
