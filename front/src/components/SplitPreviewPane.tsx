'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, RefreshCw, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/Loading';

// Live split-view preview pane (MVP3 Phase 6), shared by the admin template
// editor and the user CV Builder. It owns the whole "render as you type"
// behaviour so both screens get it identically:
//
// - debounce: a request only fires once typing pauses (default 700ms), so rapid
//   keystrokes collapse into one compile instead of one per character;
// - cancel: a newer edit aborts the in-flight request (AbortController), which
//   pairs with the server's per-user supersede so at most one preview compiles;
// - keep-last-good: on error the previous image stays on screen with a small
//   inline note, instead of flashing empty;
// - ephemeral: nothing is stored here or server-side — this is a preview only,
//   the real [Generate PDF] / [Save] action is a separate, explicit step.

/** Minimum shape a preview endpoint must return for the pane to render it. */
export interface SplitPreviewData {
  /** Base64 PNG data URL, or null when the server could not render one. */
  image: string | null;
  /** Optional server-provided, user-safe note (e.g. "preview unavailable"). */
  error?: string | null;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface SplitPreviewPaneProps<T extends SplitPreviewData> {
  /**
   * Serialized signature of the inputs (template + field values, or the LaTeX
   * source). Any change restarts the debounce timer and supersedes the previous
   * request — so it must capture everything the preview depends on.
   */
  signature: string;
  /** When false the pane shows its idle state and never fetches. */
  enabled?: boolean;
  /** Debounce window in ms before a paused edit triggers a compile. */
  debounceMs?: number;
  /** Builds and sends the request. MUST honour `signal` so it can be aborted. */
  fetchPreview: (signal: AbortSignal) => Promise<T>;
  /** Receives every successful response, so the caller can reuse extra fields. */
  onResult?: (data: T) => void;
  title?: string;
  idleLabel?: string;
  /**
   * Rendered under the title, e.g. `Template: Classic`. Keeps the active inputs
   * unambiguous — a preview with no visible source is a guessing game.
   */
  subtitle?: string;
  /** Rendered at the end of the header: a "Change template" link, say. */
  headerAction?: React.ReactNode;
  className?: string;
}

export function SplitPreviewPane<T extends SplitPreviewData>({
  signature,
  enabled = true,
  debounceMs = 700,
  fetchPreview,
  onResult,
  title = 'Live preview',
  idleLabel = 'Start typing to see a live preview.',
  subtitle,
  headerAction,
  className = '',
}: SplitPreviewPaneProps<T>) {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [note, setNote] = useState<string | null>(null);
  // The note the admin/user has dismissed. Keyed by text rather than a boolean so
  // a *different* error always re-announces itself, even after one was dismissed.
  const [dismissedNote, setDismissedNote] = useState<string | null>(null);
  // Bumped by the "Try again" button to re-run without editing the inputs.
  const [reloadKey, setReloadKey] = useState(0);

  // Call the latest closures from inside the debounce timer, so a request that
  // fires 700ms later still carries the values currently on screen.
  const fetchRef = useRef(fetchPreview);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    fetchRef.current = fetchPreview;
    onResultRef.current = onResult;
  });

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    // Supersede: abort whatever is in flight before debouncing the new request.
    controllerRef.current?.abort();
    setStatus('loading');

    const timer = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      fetchRef
        .current(controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          onResultRef.current?.(result);
          if (result.image) {
            setImage(result.image);
            setNote(result.error ?? null);
            setDismissedNote(null);
            setStatus('ready');
          } else {
            // A 200 with no image is a graceful degradation (sandbox down, or a
            // template that does not compile): keep the last good image and
            // surface the server's note.
            setNote(result.error ?? 'No preview available yet.');
            setStatus('error');
          }
        })
        .catch((err: unknown) => {
          const aborted =
            controller.signal.aborted ||
            (err instanceof DOMException && err.name === 'AbortError');
          if (aborted) return;
          setNote(err instanceof Error ? err.message : 'Preview failed.');
          setStatus('error');
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      // Leaving the screen (or a closed tab) must not leave a request running.
      controllerRef.current?.abort();
    };
  }, [signature, enabled, debounceMs, reloadKey]);

  const loading = status === 'loading';
  const failed = status === 'error';
  const showImage = enabled && image !== null;
  // The first render has nothing to compare against, so "up to date" would be a
  // lie; only claim it once an image is actually on screen.
  const upToDate = !loading && !failed && image !== null;
  // A dismissed banner stays gone until the message itself changes, so a
  // re-render of the *same* error does not nag, but a new one still surfaces.
  const bannerVisible = failed && Boolean(note) && dismissedNote !== note;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card ${className}`}
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
            <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {headerAction}
          <span
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {loading && (
              <>
                <LoadingSpinner size="sm" />
                Compiling…
              </>
            )}
            {!loading && failed && <span className="text-danger">Error</span>}
            {upToDate && <span className="text-success">Up to date</span>}
          </span>
        </div>
      </header>

      <div className="relative flex min-h-[320px] flex-1 items-center justify-center bg-muted/40 p-3">
        {showImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral base64 data URL, not a cacheable asset */}
            <img
              src={image ?? undefined}
              alt="Rendered CV preview"
              className={`max-h-[70vh] w-auto max-w-full rounded-md border border-border bg-white object-contain shadow-sm transition-opacity duration-200 ${
                loading || failed ? 'opacity-60' : 'opacity-100'
              }`}
            />
            {loading && (
              <span className="absolute inset-x-0 top-3 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                  <LoadingSpinner size="sm" />
                  Updating…
                </span>
              </span>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground">
            {loading ? (
              <>
                <LoadingSpinner size="md" />
                <span>Rendering your preview…</span>
              </>
            ) : failed ? (
              <>
                <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
                <span>{note ?? 'Preview unavailable.'}</span>
              </>
            ) : (
              <>
                <Eye className="h-6 w-6" aria-hidden />
                <span>{idleLabel}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Banner sits *over* a kept-last-good image rather than replacing it: the
          last successful render is the user's reference while they fix the error.
          Dismissible, because it is informational and in the way of the preview. */}
      {showImage && bannerVisible && (
        <div
          role="alert"
          className="flex items-start gap-2 border-t border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{note}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
          <button
            type="button"
            onClick={() => setDismissedNote(note)}
            aria-label="Dismiss preview error"
            className="shrink-0 rounded p-0.5 hover:bg-danger/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      {!showImage && failed && (
        <div className="border-t border-border px-4 py-2 text-center">
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
