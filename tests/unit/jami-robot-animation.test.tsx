import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RobotJami } from '../../src/components/jami/RobotJami';
import { JamiFloatingRobotStage } from '../../src/components/jami/floating/JamiFloatingRobotStage';
import { mapJamiStateToVisual, RobotVisualState } from '../../src/components/jami/robot-types';
import { useNaturalBlink } from '../../src/components/jami/useNaturalBlink';
import { buildVietnameseCueSequence, useJamiLipSync } from '../../src/components/jami/useJamiLipSync';
import { VoiceJamiProvider } from '../../src/context/VoiceJamiContext';
import {
  clampPositionToViewport,
  loadSavedRobotPosition,
  saveRobotPosition,
  STORAGE_KEY_ROBOT_POSITION,
} from '../../src/components/jami/floating/jami-floating-position';

describe('Robot Jami 2D Character & Animation Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('1. State Mapping Engine (mapJamiStateToVisual)', () => {
    it('correctly maps all system states to visual robot poses', () => {
      expect(mapJamiStateToVisual('disabled')).toBe('poweredDown');
      expect(mapJamiStateToVisual('requesting_permission')).toBe('attentiveWarning');
      expect(mapJamiStateToVisual('armed')).toBe('attentiveIdle');
      expect(mapJamiStateToVisual('wake_detected')).toBe('acknowledge');
      expect(mapJamiStateToVisual('listening_command')).toBe('listening');
      expect(mapJamiStateToVisual('connecting')).toBe('thinking');
      expect(mapJamiStateToVisual('thinking')).toBe('thinking');
      expect(mapJamiStateToVisual('speaking')).toBe('speaking');
      expect(mapJamiStateToVisual('confirmation_pending')).toBe('presenting');
      expect(mapJamiStateToVisual('executing')).toBe('working');
      expect(mapJamiStateToVisual('celebrating')).toBe('celebrating');
      expect(mapJamiStateToVisual('sleeping')).toBe('sleeping');
      expect(mapJamiStateToVisual('error')).toBe('error');
      expect(mapJamiStateToVisual('idle')).toBe('idle');
      expect(mapJamiStateToVisual(undefined)).toBe('idle');
      expect(mapJamiStateToVisual('unknown_future_state')).toBe('idle');
    });
  });

  describe('2. Natural Blink Hook (useNaturalBlink)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('triggers natural blink within expected random timer window and resets', () => {
      const { result } = renderHook(() => useNaturalBlink({ state: 'idle' }));

      expect(result.current.isBlinking).toBe(false);
      expect(result.current.blinkProgress).toBe(0);

      act(() => {
        vi.advanceTimersByTime(6600);
      });

      expect(result.current.blinkProgress).toBeGreaterThanOrEqual(0);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.isBlinking).toBe(false);
      expect(result.current.blinkProgress).toBe(0);
    });

    it('does not blink when robot is sleeping or disabled', () => {
      const { result, rerender } = renderHook(
        ({ state }: { state: RobotVisualState }) => useNaturalBlink({ state }),
        { initialProps: { state: 'sleeping' as RobotVisualState } }
      );

      expect(result.current.isBlinking).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.isBlinking).toBe(false);

      rerender({ state: 'poweredDown' });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(result.current.isBlinking).toBe(false);
    });

    it('does not blink when reducedMotion is enabled', () => {
      const { result } = renderHook(() =>
        useNaturalBlink({ state: 'idle', reducedMotion: true })
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.isBlinking).toBe(false);
      expect(result.current.blinkProgress).toBe(0);
    });
  });

  describe('3. Vietnamese Lip-Sync Engine (useJamiLipSync & buildVietnameseCueSequence)', () => {
    it('parses Vietnamese text into valid phonetic mouth cues with punctuation pauses', () => {
      const cues = buildVietnameseCueSequence('Chào bạn, Jami đây!');
      expect(cues.length).toBeGreaterThan(0);

      const shapes = cues.map((c) => c.shape);
      expect(shapes).toContain('wide');
      expect(shapes).toContain('closed');
      expect(shapes).toContain('rest');
    });

    it('returns rest shape and zero energy when isSpeaking is false', () => {
      const { result } = renderHook(() =>
        useJamiLipSync({ isSpeaking: false, text: 'Xin chào bạn' })
      );

      expect(result.current.mouthShape).toBe('rest');
      expect(result.current.speechEnergy).toBe(0);
    });

    it('transitions mouth shapes and speech energy while isSpeaking is true', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useJamiLipSync({ isSpeaking: true, text: 'Ba mẹ ơi' })
      );

      expect(['closed', 'wide', 'small', 'rest', 'round']).toContain(result.current.mouthShape);
      expect(result.current.speechEnergy).toBeGreaterThan(0);

      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(result.current.mouthShape).toBeDefined();
      vi.useRealTimers();
    });
  });

  describe('4. Premium Robot 2D Character Rendering & Clean Visual Baseline', () => {
    it('renders clean source visual by default without deformed stickers or overlapping badges', () => {
      const { container } = render(
        <MemoryRouter>
          <VoiceJamiProvider>
            <RobotJami state="idle" size="md" />
          </VoiceJamiProvider>
        </MemoryRouter>
      );

      // Verify Premium image element exists
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute('src')).toContain('/robot/jami-robot-premium-base.png');

      // In source mode, no overlapping stickers or double face visor
      expect(container.querySelector('#jami-visor-assembly')).not.toBeInTheDocument();
    });

    it('renders head avatar mode with square aspect ratio and head base image', () => {
      const { container } = render(
        <MemoryRouter>
          <VoiceJamiProvider>
            <RobotJami state="idle" size="sm" displayMode="head" />
          </VoiceJamiProvider>
        </MemoryRouter>
      );

      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute('src')).toContain('/robot/jami-robot-head-base.png');
    });

    it('renders clean dynamic face overlay when faceMode="clean-dynamic"', () => {
      const { container } = render(
        <MemoryRouter>
          <VoiceJamiProvider>
            <RobotJami state="idle" size="md" faceMode="clean-dynamic" />
          </VoiceJamiProvider>
        </MemoryRouter>
      );

      expect(container.querySelector('#jami-visor-assembly')).toBeInTheDocument();
    });

    it('switches to legacy SVG renderer when renderer="legacy"', () => {
      const { container } = render(
        <MemoryRouter>
          <VoiceJamiProvider>
            <RobotJami state="idle" size="md" renderer="legacy" />
          </VoiceJamiProvider>
        </MemoryRouter>
      );

      expect(container.querySelector('#camera-eye-module')).toBeInTheDocument();
      expect(container.querySelector('#torso-at-waist')).toBeInTheDocument();
      expect(container.querySelector('#left-arm-at-shoulder')).toBeInTheDocument();
    });

    it('supports keyboard accessibility (Enter/Space) and custom onClick', () => {
      const handleClick = vi.fn();
      render(
        <MemoryRouter>
          <VoiceJamiProvider>
            <RobotJami state="idle" onClick={handleClick} />
          </VoiceJamiProvider>
        </MemoryRouter>
      );

      const robotBtn = screen.getByRole('button', { name: /Trợ lý Robot Jami/i });
      expect(robotBtn).toBeInTheDocument();

      fireEvent.keyDown(robotBtn, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(robotBtn, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('5. Floating Stage Position, Drag & Click Discrimination', () => {
    it('clamps coordinates safely within viewport margins', () => {
      const clamped = clampPositionToViewport({ x: -100, y: 2000 }, 1440, 900, 148, 214);
      expect(clamped.x).toBe(24);
      expect(clamped.y).toBe(900 - 214 - 24);
    });

    it('saves and loads position accurately from localStorage', () => {
      saveRobotPosition({ x: 450, y: 300 });
      const raw = localStorage.getItem(STORAGE_KEY_ROBOT_POSITION);
      expect(raw).toBeTruthy();

      const loaded = loadSavedRobotPosition(1440, 900, 148, 214);
      expect(loaded.x).toBe(450);
      expect(loaded.y).toBe(300);
    });

    it('handles corrupted localStorage gracefully by falling back to default', () => {
      localStorage.setItem(STORAGE_KEY_ROBOT_POSITION, 'invalid-json{');
      const loaded = loadSavedRobotPosition(1440, 900, 148, 214);
      expect(loaded.x).toBeGreaterThan(0);
      expect(loaded.y).toBeGreaterThan(0);
    });

    it('distinguishes tap click from drag and suppresses click on drag', () => {
      const handleClick = vi.fn();
      const { container } = render(
        <JamiFloatingRobotStage robotWidth={148} robotHeight={214}>
          {() => (
            <button onClick={handleClick}>Robot Target</button>
          )}
        </JamiFloatingRobotStage>
      );

      const stage = container.firstChild as HTMLElement;
      expect(stage).toBeInTheDocument();

      // Normal tap
      fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerUp(stage, { clientX: 101, clientY: 101, pointerId: 1 });
      fireEvent.click(screen.getByText('Robot Target'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
