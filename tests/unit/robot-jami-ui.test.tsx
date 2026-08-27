import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RobotJami } from '../../src/components/jami/RobotJami';
import { VoiceJamiProvider, useVoiceJami } from '../../src/context/VoiceJamiContext';

// Mock Web Speech & Media APIs
beforeEach(() => {
  vi.clearAllMocks();

  // Mock getUserMedia
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [
          { stop: vi.fn() },
        ],
      }),
    },
    writable: true,
  });

  // Mock SpeechSynthesis
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: vi.fn((utterance) => {
        utterance.onend?.();
      }),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
    },
    writable: true,
  });
});

const TestConsumerComponent = () => {
  const voice = useVoiceJami();
  return (
    <div>
      <span data-testid="voice-state">{voice.state}</span>
      <button data-testid="btn-enable" onClick={voice.enableHandsFree}>
        Bật rảnh tay
      </button>
      <button data-testid="btn-disable" onClick={voice.disableHandsFree}>
        Tắt rảnh tay
      </button>
      <RobotJami />
    </div>
  );
};

describe('Robot Jami & Voice Context UI Tests', () => {
  it('renders RobotJami in idle state by default with speech bubble', () => {
    render(
      <MemoryRouter>
        <VoiceJamiProvider>
          <RobotJami bubbleMessage="Chào Minh, Jami đang sẵn sàng!" />
        </VoiceJamiProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Chào Minh, Jami đang sẵn sàng!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trợ lý/i })).toBeInTheDocument();
  });

  it('triggers user gesture to enable hands-free mode and transitions state', async () => {
    render(
      <MemoryRouter>
        <VoiceJamiProvider>
          <TestConsumerComponent />
        </VoiceJamiProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('voice-state').textContent).toBe('disabled');

    // Click user gesture button
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-enable'));
    });

    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('disables handsfree and resets state cleanly when clicking disable', async () => {
    render(
      <MemoryRouter>
        <VoiceJamiProvider>
          <TestConsumerComponent />
        </VoiceJamiProvider>
      </MemoryRouter>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-enable'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-disable'));
    });

    expect(screen.getByTestId('voice-state').textContent).toBe('disabled');
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
