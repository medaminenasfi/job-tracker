import { fireEvent, render, screen } from '@testing-library/react';
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LatexEditor } from './LatexEditor';

const SOURCE = '\\documentclass{article}\n{{fullName}}\n\\end{document}';

describe('LatexEditor', () => {
  it('numbers every line of the source', () => {
    render(<LatexEditor aria-label="LaTeX source" value={SOURCE} onChange={() => {}} />);

    // Three source lines plus a minimum floor, numbered from 1.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  // A short template must not collapse to a one-digit gutter.
  it('keeps a minimum gutter height for a short source', () => {
    render(<LatexEditor aria-label="LaTeX source" value="one line" onChange={() => {}} />);
    expect(screen.getByText('12')).toBeTruthy();
  });

  // A trailing newline is a real, editable last line: under-numbering it would
  // make the "line 3" the compiler reports point at the wrong row.
  it('numbers the empty line after a trailing newline', () => {
    render(
      <LatexEditor aria-label="LaTeX source" value="a\nb\n" onChange={() => {}} />,
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('marks the line the compiler blamed', () => {
    const { container } = render(
      <LatexEditor
        aria-label="LaTeX source"
        value={SOURCE}
        errorLine={2}
        onChange={() => {}}
      />,
    );

    const marker = screen.getByText('2');
    expect(marker.className).toContain('text-danger');
    // Only the failing line is marked.
    expect(screen.getByText('1').className).not.toContain('text-danger');
    expect(container).toBeTruthy();
  });

  it('marks no line when the compiler named none', () => {
    render(<LatexEditor aria-label="LaTeX source" value={SOURCE} onChange={() => {}} />);
    expect(screen.getByText('2').className).not.toContain('text-danger');
  });

  it('stays an editable textarea bound to the value', () => {
    const onChange = vi.fn();
    render(
      <LatexEditor aria-label="LaTeX source" value={SOURCE} onChange={onChange} />,
    );

    const textarea = screen.getByLabelText('LaTeX source') as HTMLTextAreaElement;
    expect(textarea.value).toBe(SOURCE);
    fireEvent.change(textarea, { target: { value: '\\documentclass{report}' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards a ref so the parent can insert at the caret', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(
      <LatexEditor ref={ref} aria-label="LaTeX source" value={SOURCE} onChange={() => {}} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('scrolls the gutter with the text so long templates stay readable', () => {
    render(<LatexEditor aria-label="LaTeX source" value={SOURCE} onChange={() => {}} />);
    const textarea = screen.getByLabelText('LaTeX source');

    // jsdom does not lay out, so the scrollTop has to be set directly.
    Object.defineProperty(textarea, 'scrollTop', { value: 60, writable: true });
    fireEvent.scroll(textarea);

    const gutter = screen.getByText('1').parentElement as HTMLElement;
    expect(gutter.style.transform).toBe('translateY(-60px)');
  });
});