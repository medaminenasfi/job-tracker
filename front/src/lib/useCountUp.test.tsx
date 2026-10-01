import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from './useCountUp';

// Minimal frame queue so the rAF-driven animation can be stepped deterministically.
function stubFrames() {
  const queue: Array<{ cb: FrameRequestCallback; canceled: boolean }> = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push({ cb, canceled: false });
    return queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    if (queue[id - 1]) queue[id - 1].canceled = true;
  });
  return {
    queue,
    /** Runs queued frames, advancing the clock by `stepMs` each frame. */
    drive(stepMs: number) {
      let now = performance.now() + stepMs;
      let guard = 0;
      while (queue.length && guard++ < 500) {
        const frame = queue.shift();
        now += stepMs;
        if (frame && !frame.canceled) frame.cb(now);
      }
      return now;
    },
    /** Runs exactly one queued frame. */
    stepOnce(stepMs: number) {
      const frame = queue.shift();
      if (frame && !frame.canceled) frame.cb(performance.now() + stepMs);
    },
  };
}

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCountUp', () => {
  it('animates from 0 up to the target value', () => {
    stubMatchMedia(false);
    const frames = stubFrames();

    const { result } = renderHook(() => useCountUp(10, 100));

    expect(result.current).toBe(0);
    act(() => {
      frames.stepOnce(30);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(10);

    act(() => {
      frames.drive(30);
    });
    expect(result.current).toBe(10);
  });

  it('snaps straight to the target when reduced motion is preferred', () => {
    stubMatchMedia(true);
    stubFrames();

    const { result } = renderHook(() => useCountUp(42, 100));

    expect(result.current).toBe(42);
  });

  it('returns the target immediately for a zero duration', () => {
    stubMatchMedia(false);
    stubFrames();

    const { result } = renderHook(() => useCountUp(7, 0));

    expect(result.current).toBe(7);
  });
});
