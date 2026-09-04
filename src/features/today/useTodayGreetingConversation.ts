import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { useVoiceJami } from '../../context/VoiceJamiContext';
import {
  GreetingQuestionItem,
  getRandomGreetingQuestion,
} from './today-greetings';

export type GreetingConversationStatus = 'asking' | 'thinking' | 'replied';

export interface UseTodayGreetingConversationResult {
  questionItem: GreetingQuestionItem;
  displayMessage: string;
  status: GreetingConversationStatus;
  answerText: string;
  setAnswerText: (text: string) => void;
  handleSubmit: (customAnswer?: string) => Promise<void>;
  handleSkipOrDismiss: () => void;
  isThinking: boolean;
  hasReplied: boolean;
  // Voice Speech Recognition Features
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
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

  const voiceContext = useVoiceJami();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const hasSpokenQuestionRef = useRef(false);

  const isSpeechSupported = typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Clear timeout utility
  const clearFallbackTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Stop speech recognition utility
  const stopListening = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
      speechRecognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Speak initial question ONLY when isReady is true (all page data has loaded)
  useEffect(() => {
    if (!isReady) return;
    if (!hasSpokenQuestionRef.current && voiceContext?.speak) {
      hasSpokenQuestionRef.current = true;
      try {
        voiceContext.speak(questionItem.question);
      } catch {
        // Autoplay may be blocked by browser until user gesture
      }
    }
  }, [isReady, questionItem.question, voiceContext]);

  // Set 12-second timeout for fallback reply ONLY after isReady is true
  useEffect(() => {
    if (!isReady || status !== 'asking' || isListening) {
      clearFallbackTimer();
      return;
    }

    timerRef.current = setTimeout(() => {
      // If user hasn't answered, transition to fallback reply
      setStatus('replied');
      setDisplayMessage(questionItem.fallbackReply);
      if (voiceContext?.speak) {
        try {
          voiceContext.speak(questionItem.fallbackReply);
        } catch {
          // Ignore audio error
        }
      }
    }, 12000);

    return () => {
      clearFallbackTimer();
    };
  }, [isReady, status, isListening, questionItem.fallbackReply, clearFallbackTimer, voiceContext]);

  const handleSubmit = useCallback(
    async (customAnswer?: string) => {
      stopListening();
      clearFallbackTimer();

      const textToSend = typeof customAnswer === 'string' ? customAnswer : answerText;
      const trimmed = textToSend.trim();

      if (!trimmed) {
        // If empty, show fallback reply
        setStatus('replied');
        setDisplayMessage(questionItem.fallbackReply);
        if (voiceContext?.speak) {
          voiceContext.speak(questionItem.fallbackReply);
        }
        return;
      }

      setStatus('thinking');

      try {
        const response = await api.sendJamiChat(
          `[Lời chào tương tác đầu ngày]\nCâu hỏi: "${questionItem.question}"\nHọc sinh (${studentName}) trả lời bằng giọng nói: "${trimmed}"\nHãy phản hồi học sinh bằng 1-2 câu tiếng Việt ngắn gọn, ấm áp, khích lệ và truyền cảm hứng.`
        );

        const reply = response.replyMessage?.text?.trim() || questionItem.fallbackReply;
        setDisplayMessage(reply);
        setStatus('replied');
        if (voiceContext?.speak) {
          voiceContext.speak(reply);
        }
      } catch {
        // Graceful fallback if AI request fails or is offline
        const localReply = `Cảm ơn ${studentName}! Jami đã lắng nghe chia sẻ của cậu. Cùng nỗ lực hết mình cho ngày hôm nay nhé!`;
        setDisplayMessage(localReply);
        setStatus('replied');
        if (voiceContext?.speak) {
          voiceContext.speak(localReply);
        }
      }
    },
    [answerText, clearFallbackTimer, questionItem.question, questionItem.fallbackReply, stopListening, studentName, voiceContext]
  );

  const startListening = useCallback(() => {
    clearFallbackTimer();
    setSpeechError(null);

    if (voiceContext?.isSpeaking) {
      voiceContext.stopSpeaking();
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

      let finalTranscript = '';

      recognizer.onstart = () => {
        setIsListening(true);
      };

      recognizer.onresult = (event: any) => {
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
        setAnswerText(fullTranscript);
      };

      recognizer.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setSpeechError(`Lỗi micro (${event.error}). Vui lòng kiểm tra quyền truy cập micro.`);
        }
        setIsListening(false);
      };

      recognizer.onend = () => {
        setIsListening(false);
        speechRecognitionRef.current = null;
        // If we captured speech, automatically submit or allow confirmation
        const captured = (finalTranscript || answerText).trim();
        if (captured) {
          handleSubmit(captured);
        }
      };

      recognizer.start();
    } catch (err: any) {
      setSpeechError(err.message || 'Không thể khởi động micro');
      setIsListening(false);
    }
  }, [answerText, clearFallbackTimer, handleSubmit, voiceContext]);

  const handleSkipOrDismiss = useCallback(() => {
    stopListening();
    clearFallbackTimer();
    setStatus('replied');
    setDisplayMessage(questionItem.fallbackReply);
    if (voiceContext?.speak) {
      voiceContext.speak(questionItem.fallbackReply);
    }
  }, [clearFallbackTimer, questionItem.fallbackReply, stopListening, voiceContext]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearFallbackTimer();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {
          // ignore
        }
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
    handleSkipOrDismiss,
    isThinking: status === 'thinking',
    hasReplied: status === 'replied',
    isListening,
    startListening,
    stopListening,
    speechError,
    isSpeechSupported,
  };
}
