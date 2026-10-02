import { SpeechLanguage, findOptimalVoice, segmentTextByLanguage } from './speech-language';

export type TtsProvider = 'browser-local' | 'wasm-local' | 'cloud';
export type TtsPhase = 'idle' | 'loading' | 'ready' | 'speaking' | 'error';
export type TtsEndReason = 'ended' | 'cancelled' | 'error';

export interface TtsSnapshot {
  phase: TtsPhase;
  provider: TtsProvider | null;
  speechId: number;
  error: string | null;
}

export interface TtsResult {
  reason: TtsEndReason;
  provider: TtsProvider | null;
  error?: Error;
}

export interface SpeakOptions { lang?: SpeechLanguage; rate?: number }
type Listener = (snapshot: TtsSnapshot) => void;
type ActiveSpeech = {
  id: number;
  attemptId: number;
  settled: boolean;
  resolve: (result: TtsResult) => void;
  abortController: AbortController;
  utterance: SpeechSynthesisUtterance | null;
  audio: HTMLAudioElement | null;
  objectUrl: string | null;
  timer: number | null;
};

const getEnv = (key: string): string | undefined => {
  const value = (import.meta.env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};
const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
};
const configuredMode = (): 'auto' | TtsProvider => {
  const value = getEnv('VITE_JAMI_TTS_MODE');
  return value === 'browser-local' || value === 'wasm-local' || value === 'cloud' ? value : 'auto';
};
const configuredChunkSize = (): number => {
  const parsed = Number(getEnv('VITE_JAMI_TTS_MAX_CHUNK_CHARS') || 220);
  return Number.isFinite(parsed) ? Math.min(500, Math.max(80, Math.round(parsed))) : 220;
};
const configuredRate = (): number => {
  if (typeof window === 'undefined') return 1.05;
  const value = Number(window.localStorage.getItem('jami.tts.rate') || 1.05);
  return Number.isFinite(value) ? Math.min(1.5, Math.max(0.75, value)) : 1.05;
};

/** Single owner for all text-to-speech output in the browser. */
export class JamiTtsEngine {
  private static instance: JamiTtsEngine;
  private listeners = new Set<Listener>();
  private nextSpeechId = 0;
  private active: ActiveSpeech | null = null;
  private snapshot: TtsSnapshot = { phase: 'idle', provider: null, speechId: 0, error: null };

  private constructor() {}
  public static getInstance(): JamiTtsEngine {
    if (!JamiTtsEngine.instance) JamiTtsEngine.instance = new JamiTtsEngine();
    return JamiTtsEngine.instance;
  }
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  public getSnapshot(): TtsSnapshot { return this.snapshot; }
  public get isSpeaking(): boolean { return this.snapshot.phase === 'speaking'; }

  public async speak(text: string, options: SpeakOptions = {}): Promise<TtsResult> {
    this.stop();
    const speechId = ++this.nextSpeechId;
    const segments = segmentTextByLanguage(text, options.lang, configuredChunkSize());
    if (segments.length === 0) return { reason: 'ended', provider: null };
    const promise = new Promise<TtsResult>((resolve) => {
      this.active = {
        id: speechId, attemptId: 0, settled: false, resolve,
        abortController: new AbortController(), utterance: null, audio: null,
        objectUrl: null, timer: null,
      };
    });
    this.emit({ phase: 'loading', provider: null, speechId, error: null });
    void this.runSpeech(speechId, segments, options).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === 'AbortError') {
        this.finish(speechId, { reason: 'cancelled', provider: this.snapshot.provider });
        return;
      }
      this.finish(speechId, { reason: 'error', provider: this.snapshot.provider, error: err });
    });
    return promise;
  }

  public stop(): void {
    const active = this.active;
    if (!active || active.settled) return;
    active.abortController.abort();
    this.clearActiveResources(active);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.finish(active.id, { reason: 'cancelled', provider: this.snapshot.provider });
  }

  private async runSpeech(
    speechId: number,
    segments: ReturnType<typeof segmentTextByLanguage>,
    options: SpeakOptions,
  ): Promise<void> {
    const mode = configuredMode();
    let localError: Error | null = null;
    if (mode === 'auto' || mode === 'browser-local') {
      try {
        await this.speakWithBrowser(speechId, segments, options.rate);
        return;
      } catch (error) {
        if (!this.isActive(speechId)) return;
        localError = error instanceof Error ? error : new Error(String(error));
        if (localError.name === 'AbortError') throw localError;
        if (mode === 'browser-local') throw localError;
      }
    }
    if (mode === 'wasm-local' || (mode === 'auto' && parseBoolean(getEnv('VITE_JAMI_TTS_WASM_ENABLED'), true))) {
      // Do not simulate an offline voice. Readiness requires the pinned sherpa
      // runtime, model, tokens and espeak-ng data to initialize successfully.
      localError ||= new Error('Gói giọng ngoại tuyến chưa được cài đặt hoặc kiểm chứng trên thiết bị này.');
      if (mode === 'wasm-local') throw localError;
    }
    if ((mode === 'cloud' || mode === 'auto') && parseBoolean(getEnv('VITE_JAMI_TTS_ALLOW_CLOUD_FALLBACK'), false)) {
      await this.speakWithCloud(speechId, segments.map((segment) => segment.text).join(' '), options.lang || 'vi-VN');
      return;
    }
    throw localError || new Error('Không tìm thấy giọng cục bộ phù hợp.');
  }

  private async getVoicesWithDeadline(speechId: number): Promise<SpeechSynthesisVoice[]> {
    const synth = window.speechSynthesis;
    const immediate = synth.getVoices();
    if (immediate.length > 0) return immediate;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        synth.removeEventListener?.('voiceschanged', onVoicesChanged);
        window.clearTimeout(timer);
        resolve(this.isActive(speechId) ? synth.getVoices() : []);
      };
      const onVoicesChanged = () => finish();
      const timer = window.setTimeout(finish, 1200);
      synth.addEventListener?.('voiceschanged', onVoicesChanged, { once: true });
    });
  }

  private async speakWithBrowser(
    speechId: number,
    segments: ReturnType<typeof segmentTextByLanguage>,
    rate?: number,
  ): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      throw new Error('Trình duyệt không hỗ trợ đọc văn bản.');
    }
    const voices = await this.getVoicesWithDeadline(speechId);
    if (!this.isActive(speechId)) return;
    for (const segment of segments) {
      const voice = findOptimalVoice(voices, segment.lang);
      if (!voice) throw new Error(segment.lang === 'vi-VN'
        ? 'Thiết bị chưa có giọng tiếng Việt cục bộ.'
        : 'Thiết bị chưa có giọng tiếng Anh cục bộ.');
      await this.speakBrowserSegment(speechId, segment.text, segment.lang, voice, rate);
      if (!this.isActive(speechId)) return;
    }
    this.finish(speechId, { reason: 'ended', provider: 'browser-local' });
  }

  private speakBrowserSegment(
    speechId: number, text: string, lang: SpeechLanguage,
    voice: SpeechSynthesisVoice, rate?: number,
  ): Promise<void> {
    const active = this.active;
    if (!active || active.id !== speechId) return Promise.resolve();
    const attemptId = ++active.attemptId;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.voice = voice;
    utterance.rate = rate ?? (lang === 'vi-VN' ? configuredRate() : 1);
    active.utterance = utterance;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (!this.matches(speechId, attemptId)) return resolve();
        this.clearTimer(active);
        active.utterance = null;
        if (error) reject(error);
        else resolve();
      };
      active.timer = window.setTimeout(() => {
        if (!this.matches(speechId, attemptId)) return;
        settle(new Error('Giọng trên thiết bị không bắt đầu phát trong thời gian cho phép.'));
        window.speechSynthesis.cancel();
      }, 4000);
      utterance.onstart = () => {
        if (!this.matches(speechId, attemptId)) return;
        this.clearTimer(active);
        this.emit({ phase: 'speaking', provider: 'browser-local', speechId, error: null });
      };
      utterance.onend = () => settle();
      utterance.onerror = (event) => {
        if (!this.matches(speechId, attemptId)) return;
        const name = event.error || 'synthesis-failed';
        if (name === 'canceled' || name === 'interrupted') {
          const cancellation = new Error(name);
          cancellation.name = 'AbortError';
          settle(cancellation);
          return;
        }
        settle(new Error(name === 'not-allowed'
          ? 'Trình duyệt đang chặn âm thanh. Hãy bấm “Thử giọng” để cho phép phát.'
          : `Không thể phát giọng trên thiết bị (${name}).`));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  private async speakWithCloud(speechId: number, text: string, lang: SpeechLanguage): Promise<void> {
    const active = this.active;
    if (!active || active.id !== speechId) return;
    const attemptId = ++active.attemptId;
    active.timer = window.setTimeout(() => active.abortController.abort(), 20_000);
    const response = await fetch('/api/v1/jami/tts', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }), signal: active.abortController.signal,
    });
    if (!this.matches(speechId, attemptId)) return;
    this.clearTimer(active);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('audio/')) {
      throw new Error(`Dịch vụ giọng trực tuyến không khả dụng (${response.status}).`);
    }
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    active.objectUrl = url;
    active.audio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onplaying = () => {
        if (this.matches(speechId, attemptId)) this.emit({ phase: 'speaking', provider: 'cloud', speechId, error: null });
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Tệp âm thanh trực tuyến không phát được.'));
      audio.play().catch(reject);
    });
    if (this.matches(speechId, attemptId)) this.finish(speechId, { reason: 'ended', provider: 'cloud' });
  }

  private matches(speechId: number, attemptId: number): boolean {
    return Boolean(this.active && !this.active.settled && this.active.id === speechId && this.active.attemptId === attemptId);
  }
  private isActive(speechId: number): boolean {
    return Boolean(this.active && !this.active.settled && this.active.id === speechId);
  }
  private clearTimer(active: ActiveSpeech): void {
    if (active.timer !== null) window.clearTimeout(active.timer);
    active.timer = null;
  }
  private clearActiveResources(active: ActiveSpeech): void {
    this.clearTimer(active);
    if (active.utterance) {
      active.utterance.onstart = null; active.utterance.onend = null; active.utterance.onerror = null;
      active.utterance = null;
    }
    if (active.audio) {
      active.audio.onplaying = null; active.audio.onended = null; active.audio.onerror = null;
      active.audio.pause(); active.audio.removeAttribute('src'); active.audio.load(); active.audio = null;
    }
    if (active.objectUrl) URL.revokeObjectURL(active.objectUrl);
    active.objectUrl = null;
  }
  private finish(speechId: number, result: TtsResult): void {
    const active = this.active;
    if (!active || active.id !== speechId || active.settled) return;
    active.settled = true;
    this.clearActiveResources(active);
    this.active = null;
    this.emit({ phase: result.reason === 'error' ? 'error' : 'idle', provider: result.provider, speechId, error: result.error?.message || null });
    active.resolve(result);
  }
  private emit(snapshot: TtsSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const jamiTts = JamiTtsEngine.getInstance();
