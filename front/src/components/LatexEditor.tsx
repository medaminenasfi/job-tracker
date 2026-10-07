'use client';

import { forwardRef, useCallback, useState } from 'react';
import { Textarea } from '@/components/ui/Field';

// A .tex editor with the two affordances a plain textarea cannot give an author:
// line numbers, and a marker on the line the compiler blamed.
//
// Why not a code-editor dependency: the gutter is the only thing that really
// needs a second pane, and a syntax-highlighted textarea would have to
// re-implement indentation and escaping badly. Line numbers are derived from the
// same string that is rendered, so they can never drift from the text.
//
// The gutter is translated rather than scrolled: it has `overflow-hidden` and an
// inner column offset by the textarea's scrollTop, which keeps the two in sync
// without a scroll container of its own (a second scrollbar would be a bug, not
// a feature).

/** Rows the gutter always shows, so a one-line template is not a single digit. */
const MIN_ROWS = 12;

interface LatexEditorProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onScroll'> {
  value: string;
  /** 1-based line the compiler reported, or undefined when it named none. */
  errorLine?: number;
}

export const LatexEditor = forwardRef<HTMLTextAreaElement, LatexEditorProps>(
  function LatexEditor({ value, errorLine, className = '', ...rest }, ref) {
    // A trailing newline yields a final empty row, which is what the editor
    // actually shows — so counting lines this way under-numbers nothing.
    const lineCount = Math.max(MIN_ROWS, value.split('\n').length);
    const lines = Array.from({ length: lineCount }, (_, index) => index + 1);
    const [scrollTop, setScrollTop] = useState(0);

    const handleScroll = useCallback(
      (event: React.UIEvent<HTMLTextAreaElement>) => {
        setScrollTop(event.currentTarget.scrollTop);
      },
      [],
    );

    return (
      <div className="flex overflow-hidden rounded-lg border border-input bg-background focus-within:border-accent">
        <div
          aria-hidden
          className="max-h-[420px] w-12 shrink-0 overflow-hidden border-r border-border bg-muted/60"
        >
          <div
            className="px-2 py-2 text-right font-mono text-xs leading-5 text-muted-foreground"
            style={{ transform: `translateY(${-scrollTop}px)` }}
          >
            {lines.map((line) => (
              <div
                key={line}
                className={line === errorLine ? 'font-bold text-danger' : undefined}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
        <Textarea
          ref={ref}
          value={value}
          onScroll={handleScroll}
          spellCheck={false}
          // Gutter and text share padding and line-height, or the numbers drift
          // away from the code they label.
          className={`max-h-[420px] rounded-none border-0 font-mono text-xs leading-5 focus:border-0 ${className}`}
          {...rest}
        />
      </div>
    );
  },
);