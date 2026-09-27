import { api } from './api-client';
import { SpeechLanguage, findOptimalVoice } from './speech-language';

export class JamiTtsEngine {
  private static instance: JamiTtsEngine;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private abortController: AbortController | null = null;
  public isSpeaking: boolean = false;

  private constructor() {}

  public static getInstance(): JamiTtsEngine {
    if (!JamiTtsEngine.instance) {
      JamiTtsEngine.instance = new JamiTtsEngine();
    }
    return JamiTtsEngine.instance;
  }

  public async speak(
    text: string,
    options?: {
      lang?: SpeechLanguage;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: Error) => void;
    }
  ) {
    this.stop();
    this.isSpeaking = true;
    
    if (options?.onStart) options.onStart();

    const lang = options?.lang || 'vi-VN';
    this.abortController = new AbortController();

    try {
      // Primary: OpenAI TTS via backend
      const response = await fetch('/api/v1/jami/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`
        },
        body: JSON.stringify({ text, language: lang }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP Error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      this.currentAudio = new Audio(url);
      
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        this.isSpeaking = false;
        if (options?.onEnd) options.onEnd();
      };

      this.currentAudio.onerror = () => {
        URL.revokeObjectURL(url);
        this.isSpeaking = false;
        this.fallbackWebSpeech(text, lang, options?.onEnd, options?.onError);
      };

      await this.currentAudio.play();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.isSpeaking = false;
        return;
      }
      console.warn('[JamiTTS] OpenAI TTS failed, falling back to Web Speech:', err);
      this.fallbackWebSpeech(text, lang, options?.onEnd, options?.onError);
    }
  }

  private fallbackWebSpeech(text: string, lang: SpeechLanguage, onEnd?: () => void, onError?: (err: Error) => void) {
    if (!('speechSynthesis' in window)) {
      this.isSpeaking = false;
      if (onError) onError(new Error('No TTS engine available.'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = findOptimalVoice(voices, lang);
    if (voice) {
      utterance.voice = voice;
    }
    
    utterance.lang = lang;
    
    utterance.onend = () => {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      if (onError) onError(new Error(e.error));
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  public stop() {
    this.isSpeaking = false;
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    this.currentUtterance = null;
  }
}

export const jamiTts = JamiTtsEngine.getInstance();
