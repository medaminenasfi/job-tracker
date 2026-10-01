import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobDescription } from './JobDescription';

describe('JobDescription', () => {
  it('renders safe HTML formatting and removes scripts', () => {
    const { container } = render(
      <JobDescription value='<h2>Responsibilities</h2><ul><li>Build features</li></ul><script>alert(1)</script>' />,
    );

    expect(screen.getByRole('heading', { name: 'Responsibilities' })).toBeTruthy();
    expect(screen.getByText('Build features')).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
  });

  it('preserves plain-text line breaks and handles empty descriptions', () => {
    const { rerender } = render(<JobDescription value={'Line one\nLine two'} />);
    expect(screen.getByText(/Line one/)).toBeTruthy();

    rerender(<JobDescription value="" />);
    expect(screen.getByText('No description available.')).toBeTruthy();
  });
});