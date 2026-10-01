import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobCard } from './JobCard';

const job = {
  id: 'job-1',
  title: 'Frontend Engineer',
  company: 'Acme',
  location: 'Remote',
  source: 'linkedin',
  status: 'SAVED',
} as never;

describe('JobCard', () => {
  it('opens details from the card and the View Details action', () => {
    const onViewDetails = vi.fn();
    render(<JobCard job={job} onViewDetails={onViewDetails} />);

    fireEvent.click(screen.getByRole('heading', { name: 'Frontend Engineer' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));

    expect(onViewDetails).toHaveBeenCalledTimes(2);
  });

  it('does not open details after pointer movement used for dragging', () => {
    const onViewDetails = vi.fn();
    render(<JobCard job={job} onViewDetails={onViewDetails} />);
    const card = screen.getByRole('article', { name: /Frontend Engineer/ });

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
    fireEvent.click(card, { clientX: 40, clientY: 40 });

    expect(onViewDetails).not.toHaveBeenCalled();
  });
});