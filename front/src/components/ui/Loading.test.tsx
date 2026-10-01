import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ButtonLoader, SectionLoader } from './Loading';

describe('loading primitives', () => {
  it('announces section loading text accessibly', () => {
    render(<SectionLoader label="Loading jobs..." />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading jobs...')).toBeTruthy();
  });

  it('keeps button loading text visible beside the spinner', () => {
    render(<ButtonLoader label="Saving..." />);

    expect(screen.getByText('Saving...')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});