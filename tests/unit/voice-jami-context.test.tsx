import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VoiceJamiProvider, useVoiceJami } from '../../src/context/VoiceJamiContext';
import { api } from '../../src/lib/api-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  started = false;
  stopped = false;

  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.stopped = true; }
}

/**
 * Creates a controllable speechSynthesis mock.
 * `autoFire` controls whether speak() immediately fires onstart + onend.
 */
function makeSpeechSynthesisMock(
  options: {
    autoFire?: boolean;
    speakCallback?: (u: SpeechSynthesisUtterance) => void;
    voices?: SpeechSynthesisVoice[];
  } = {}
) {
  const { autoFire = true, speakCallback, voices = [{ lang: 'vi-VN', name: 'Vietnamese', localService: true } as SpeechSynthesisVoice] } = options;
  const mock = {
    speaking: false,
    paused: false,
    lastUtterance: null as SpeechSynthesisUtterance | null,
    getVoices: vi.fn().mockReturnValue(voices),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      mock.lastUtterance = utterance;
      if (speakCallback) {
        speakCallback(utterance);
      } else if (autoFire) {
        mock.speaking = true;
        utterance.onstart?.(new Event('start') as any);
        mock.speaking = false;
        utterance.onend?.(new Event('end') as any);
      }
    }),
    cancel: vi.fn(() => { mock.speaking = false; }),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return mock;
}

/** Renders provider + consumer, returns helper accessors */
function setup() {
  const Consumer = () => {
    const voice = useVoiceJami();
    return (
      <>
        <button onClick={() => void voice.enableHandsFree()}>enable</button>
        <button onClick={() => voice.stopSpeaking()}>stop</button>
        <button onClick={() => voice.speak('Xin chào Jami')}>speak</button>
        <span data-testid="state">{voice.state}</span>
        <span data-testid="isSpeaking">{String(voice.isSpeaking)}</span>
        <span data-testid="error">{voice.errorMessage ?? ''}</span>
        <span data-testid="speakingMsgId">{voice.speakingMessageId ?? ''}</span>
      </>
    );
  };

  render(
    <MemoryRouter>
      <VoiceJamiProvider>
        <Consumer />
      </VoiceJamiProvider>
    </MemoryRouter>
  );
}

// ── Shared setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  FakeRecognition.instances = [];

  (window as any).SpeechRecognition = FakeRecognition;
  (window as any).webkitSpeechRecognition = FakeRecognition;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), readyState: 'live' }] }),
    },
  });

  vi.spyOn(api, 'sendVoiceCommand').mockResolvedValue({
    replyText: 'Đã mở thời khóa biểu.',
    requiresConfirmation: false,
    clientAction: { type: 'navigate', route: '/timetable' },
  } as any);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('VoiceJami TTS engine', () => {
  // ── 1. TTS success: onstart => isSpeaking true, onend => false ─────────────
  it('1. onstart sets isSpeaking=true; onend resets it to false', async () => {
    let capturedUtterance: SpeechSynthesisUtterance | null = null;
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (u) => { capturedUtterance = u; },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');

    // Fire onstart manually
    await act(async () => { capturedUtterance?.onstart?.(new Event('start') as any); });
    expect(screen.getByTestId('isSpeaking').textContent).toBe('true');

    // Fire onend manually
    await act(async () => { capturedUtterance?.onend?.(new Event('end') as any); });
    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
  });

  // ── 2. No local voice must not silently use a wrong/default voice ─────────
  it('2. getVoices()=[] waits finitely then reports an actionable error', async () => {
    const synth = makeSpeechSynthesisMock({ voices: [] });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(synth.speak).not.toHaveBeenCalled();
    expect(screen.getByTestId('error').textContent).toContain('giọng tiếng Việt cục bộ');
  });

  // ── 3. voice-unavailable must not retry with a wrong default voice ────────
  it('3. voice-unavailable reports error without default-language fallback', async () => {
    let callCount = 0;
    const utterances: SpeechSynthesisUtterance[] = [];

    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (u) => {
        utterances.push(u);
        callCount++;
        if (callCount === 1) {
          // First attempt: fire voice-unavailable error
          setTimeout(() => {
            u.onerror?.(Object.assign(new Event('error'), { error: 'voice-unavailable' }) as any);
          }, 10);
        } else {
          // Second attempt: succeed
          setTimeout(() => {
            u.onstart?.(new Event('start') as any);
            u.onend?.(new Event('end') as any);
          }, 10);
        }
      },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    await act(async () => { vi.advanceTimersByTime(50); });

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].voice?.localService).toBe(true);
    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).not.toBe('');
  });

  // ── 4. not-allowed => errorMessage, speaking resets ──────────────────────
  it('4. not-allowed onerror sets errorMessage and resets isSpeaking', async () => {
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (u) => {
        setTimeout(() => {
          u.onerror?.(Object.assign(new Event('error'), { error: 'not-allowed' }) as any);
        }, 10);
      },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    await act(async () => { vi.advanceTimersByTime(50); });

    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toContain('chặn âm thanh');
  });

  // ── 5. stopSpeaking cancels and clears refs/state ─────────────────────────
  it('5. stopSpeaking() cancels speech and resets all state', async () => {
    let capturedUtterance: SpeechSynthesisUtterance | null = null;
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (u) => { capturedUtterance = u; },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    await act(async () => { capturedUtterance?.onstart?.(new Event('start') as any); });
    expect(screen.getByTestId('isSpeaking').textContent).toBe('true');

    await act(async () => { fireEvent.click(screen.getByText('stop')); });
    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
    expect(screen.getByTestId('speakingMsgId').textContent).toBe('');
  });

  // ── 6. No forced vi-VN: bilingual text splits correctly ──────────────────
  it('6. speak() without explicit lang does not force vi-VN for English segments', async () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    const synth = makeSpeechSynthesisMock({
      autoFire: true,
      speakCallback: (u) => {
        utterances.push(u);
        u.onstart?.(new Event('start') as any);
        u.onend?.(new Event('end') as any);
      },
      voices: [
        { lang: 'vi-VN', name: 'Vietnamese', localService: true } as SpeechSynthesisVoice,
        { lang: 'en-US', name: 'English', localService: true } as SpeechSynthesisVoice,
      ],
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    const BillingualConsumer = () => {
      const voice = useVoiceJami();
      return (
        <button onClick={() => voice.speak('Hello world. Xin chào các bạn.')}>bilingual</button>
      );
    };
    render(<MemoryRouter><VoiceJamiProvider><BillingualConsumer /></VoiceJamiProvider></MemoryRouter>);

    await act(async () => { fireEvent.click(screen.getByText('bilingual')); });

    // Should have at least 2 utterances with different langs, not all vi-VN
    const langs = utterances.map((u) => u.lang);
    expect(langs).toContain('en-US');
    expect(langs).toContain('vi-VN');
  });

  // ── 7. Watchdog is finite and does not retry with a default voice ─────────
  it('7. Watchdog errors if onstart does not arrive within 4 s', async () => {
    let callCount = 0;
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (_u) => {
        callCount++;
        // Never fire onstart – simulates hung TTS
      },
    });
    // speechSynthesis.speaking stays false (nothing is actually playing)
    synth.speaking = false;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });

    await act(async () => { vi.advanceTimersByTime(4100); });

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).not.toBe(''); // error shown
  });

  it('8. stale callbacks from A cannot clear the speaking state of B', async () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (utterance) => utterances.push(utterance),
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    const Consumer = () => {
      const voice = useVoiceJami();
      return <>
        <button onClick={() => voice.speak('Lượt A')}>A</button>
        <button onClick={() => voice.speak('Lượt B')}>B</button>
        <span data-testid="race-speaking">{String(voice.isSpeaking)}</span>
      </>;
    };
    render(<MemoryRouter><VoiceJamiProvider><Consumer /></VoiceJamiProvider></MemoryRouter>);

    await act(async () => { fireEvent.click(screen.getByText('A')); });
    const staleOnEnd = utterances[0].onend;
    await act(async () => { fireEvent.click(screen.getByText('B')); });
    await act(async () => { utterances[1].onstart?.(new Event('start') as any); });
    expect(screen.getByTestId('race-speaking').textContent).toBe('true');

    await act(async () => { staleOnEnd?.call(utterances[0], new Event('end') as any); });
    expect(screen.getByTestId('race-speaking').textContent).toBe('true');
  });
});

// ── 8. Hands-free full flow ───────────────────────────────────────────────────
describe('VoiceJami hands-free lifecycle', () => {
  beforeEach(() => {
    const synth = makeSpeechSynthesisMock();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  });

  it('8a. enable -> greeting TTS -> armed -> "Jami ơi" -> ack TTS -> command -> sendVoiceCommand -> reply TTS -> re-armed', async () => {
    setup();

    // Enable hands-free
    await act(async () => { fireEvent.click(screen.getByText('enable')); });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(screen.getByTestId('state').textContent).toBe('armed');

    const wake = FakeRecognition.instances[0];

    // Non-wake phrase: no command sent
    await act(async () => {
      wake.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'mở thời khóa biểu' }, isFinal: true }] });
    });
    expect(api.sendVoiceCommand).not.toHaveBeenCalled();

    // Wake phrase detected → stop recognizer → ack TTS → new command recognizer
    await act(async () => {
      wake.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'Jami ơi' }, isFinal: true }] });
    });
    expect(wake.stopped).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(2);

    // Command spoken + end → sendVoiceCommand
    const command = FakeRecognition.instances[1];
    await act(async () => {
      command.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'mở thời khóa biểu' }, isFinal: true }] });
      command.onend?.();
    });
    expect(api.sendVoiceCommand).toHaveBeenCalledTimes(1);

    // After reply TTS ends → re-arm
    expect(screen.getByTestId('state').textContent).toBe('armed');
    expect(FakeRecognition.instances).toHaveLength(3);
  });

  it('8b. inline command (same utterance as wake word) is executed once', async () => {
    setup();

    await act(async () => { fireEvent.click(screen.getByText('enable')); });

    await act(async () => {
      FakeRecognition.instances[0].onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'Jami ơi mở thời khóa biểu hôm nay' }, isFinal: true }],
      });
    });

    expect(api.sendVoiceCommand).toHaveBeenCalledTimes(1);
    expect(api.sendVoiceCommand).toHaveBeenCalledWith(
      'mở thời khóa biểu hôm nay',
      expect.any(String),
      'browser_web_speech',
      undefined,
      expect.any(AbortSignal)
    );
  });
});

// ── canceled/interrupted onerror should NOT surface as error ─────────────────
describe('VoiceJami TTS onerror: canceled / interrupted', () => {
  it('canceled onerror silently resets state without setting errorMessage', async () => {
    let capturedUtterance: SpeechSynthesisUtterance | null = null;
    const synth = makeSpeechSynthesisMock({
      autoFire: false,
      speakCallback: (u) => { capturedUtterance = u; },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });

    setup();

    await act(async () => { fireEvent.click(screen.getByText('speak')); });
    await act(async () => { capturedUtterance?.onstart?.(new Event('start') as any); });
    await act(async () => {
      capturedUtterance?.onerror?.(Object.assign(new Event('error'), { error: 'canceled' }) as any);
    });

    expect(screen.getByTestId('isSpeaking').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('');
  });
});
