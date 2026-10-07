import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SplitPreviewPane } from './SplitPreviewPane';

const IMG = 'data:image/png;base64,AAAA';
const IMG_ALT = 'Rendered CV preview';

/** A promise whose resolution the test controls, to simulate an in-flight call. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Advance past the debounce window, flushing timers and React updates. */
async function flush(ms = 700) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('SplitPreviewPane', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the idle state and never fetches while disabled', async () => {
    const fetchPreview = vi.fn();
    render(
      <SplitPreviewPane
        signature="x"
        enabled={false}
        fetchPreview={fetchPreview}
        idleLabel="Nothing to preview yet"
      />,
    );
    expect(screen.getByText('Nothing to preview yet')).toBeTruthy();
    await flush();
    expect(fetchPreview).not.toHaveBeenCalled();
  });

  it('debounces rapid edits into a single fetch', async () => {
    const fetchPreview = vi.fn().mockResolvedValue({ image: IMG });
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    rerender(<SplitPreviewPane signature="ab" fetchPreview={fetchPreview} />);
    rerender(<SplitPreviewPane signature="abc" fetchPreview={fetchPreview} />);

    // Still inside the debounce window: nothing sent yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchPreview).not.toHaveBeenCalled();

    // Crossing the window fires exactly one request for the latest value.
    await flush(500);
    expect(fetchPreview).toHaveBeenCalledTimes(1);
  });

  it('renders the image once a preview resolves', async () => {
    const fetchPreview = vi.fn().mockResolvedValue({ image: IMG });
    render(<SplitPreviewPane signature="a" fetchPreview={fetchPreview} />);
    await flush();
    const img = screen.getByRole('img', { name: IMG_ALT });
    expect(img.getAttribute('src')).toBe(IMG);
    expect(screen.getByText('Up to date')).toBeTruthy();
  });

  it('aborts an in-flight request when a newer edit supersedes it', async () => {
    const signals: AbortSignal[] = [];
    const pending = deferred<{ image: string | null }>();
    const fetchPreview = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return pending.promise;
    });
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    await flush();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    // A new edit aborts the request that is still in flight.
    rerender(<SplitPreviewPane signature="b" fetchPreview={fetchPreview} />);
    expect(signals[0].aborted).toBe(true);

    // Settle the aborted call so nothing is left dangling; it must be ignored.
    pending.resolve({ image: IMG });
    await act(async () => {});
    expect(screen.queryByRole('img', { name: IMG_ALT })).toBeNull();
  });

  it('keeps the last good image and shows a note when a later preview fails', async () => {
    const fetchPreview = vi
      .fn()
      .mockResolvedValueOnce({ image: IMG })
      .mockRejectedValueOnce(new Error('Sandbox is busy'));
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    await flush();
    expect(screen.getByRole('img', { name: IMG_ALT }).getAttribute('src')).toBe(
      IMG,
    );

    rerender(<SplitPreviewPane signature="b" fetchPreview={fetchPreview} />);
    await flush();

    // The previous render stays on screen; the error is a small inline note.
    expect(screen.getByRole('img', { name: IMG_ALT }).getAttribute('src')).toBe(
      IMG,
    );
    expect(screen.getByText('Sandbox is busy')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('surfaces a server note when the response carries no image', async () => {
    const fetchPreview = vi
      .fn()
      .mockResolvedValue({ image: null, error: 'Live preview is unavailable' });
    render(<SplitPreviewPane signature="a" fetchPreview={fetchPreview} />);
    await flush();
    expect(screen.queryByRole('img', { name: IMG_ALT })).toBeNull();
    expect(screen.getByText('Live preview is unavailable')).toBeTruthy();
  });

  it('shows a loading state while rendering', async () => {
    const pending = deferred<{ image: string | null }>();
    const fetchPreview = vi.fn(() => pending.promise);
    render(<SplitPreviewPane signature="a" fetchPreview={fetchPreview} />);
    // The pane enters loading as soon as an edit is registered.
    expect(screen.getByText('Compiling…')).toBeTruthy();

    await flush();
    expect(screen.getByText('Rendering your preview…')).toBeTruthy();

    pending.resolve({ image: IMG });
    await act(async () => {});
    expect(screen.getByRole('img', { name: IMG_ALT })).toBeTruthy();
  });

  it('names the error state so the status line is not ambiguous', async () => {
    const fetchPreview = vi.fn().mockResolvedValue({ image: IMG });
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    await flush();
    expect(screen.getByText('Up to date')).toBeTruthy();

    rerender(
      <SplitPreviewPane
        signature="b"
        fetchPreview={vi.fn().mockRejectedValue(new Error('boom'))}
      />,
    );
    await flush();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.queryByText('Up to date')).toBeNull();
  });

  // The last good render is the reference while the user fixes the error, so the
  // banner is an overlay with a dismiss control rather than a replacement.
  it('overlays a dismissible error banner without hiding the last good render', async () => {
    const fetchPreview = vi
      .fn()
      .mockResolvedValueOnce({ image: IMG })
      .mockRejectedValueOnce(new Error('Sandbox is busy'));
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    await flush();

    rerender(<SplitPreviewPane signature="b" fetchPreview={fetchPreview} />);
    await flush();

    expect(screen.getByRole('alert').textContent).toContain('Sandbox is busy');
    expect(screen.getByRole('img', { name: IMG_ALT })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss preview error' }));

    // Dismissed: the image stays, the nag stops.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img', { name: IMG_ALT })).toBeTruthy();
  });

  // Dismissing one error must not silence the next, different one.
  it('re-raises the banner when a different error follows', async () => {
    const fetchPreview = vi
      .fn()
      .mockResolvedValueOnce({ image: IMG })
      .mockRejectedValueOnce(new Error('First problem'))
      .mockRejectedValueOnce(new Error('Second problem'));
    const { rerender } = render(
      <SplitPreviewPane signature="a" fetchPreview={fetchPreview} />,
    );
    await flush();

    rerender(<SplitPreviewPane signature="b" fetchPreview={fetchPreview} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss preview error' }));
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<SplitPreviewPane signature="c" fetchPreview={fetchPreview} />);
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('Second problem');
  });

  it('shows the active inputs as a subtitle with a header action', () => {
    const fetchPreview = vi.fn();
    render(
      <SplitPreviewPane
        signature="a"
        enabled={false}
        fetchPreview={fetchPreview}
        subtitle="Template: Classic"
        headerAction={<a href="/pick">Change template</a>}
      />,
    );
    expect(screen.getByText('Template: Classic')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Change template' })).toBeTruthy();
  });

  it('reports each successful result to onResult', async () => {
    const onResult = vi.fn();
    const fetchPreview = vi
      .fn()
      .mockResolvedValue({ image: IMG, placeholders: ['fullName'] });
    render(
      <SplitPreviewPane
        signature="a"
        fetchPreview={fetchPreview}
        onResult={onResult}
      />,
    );
    await flush();
    expect(onResult).toHaveBeenCalledWith({
      image: IMG,
      placeholders: ['fullName'],
    });
  });
});
