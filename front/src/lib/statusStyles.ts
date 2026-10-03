// Single source of truth for job-status colors across the whole app.
// Previously KanbanBoard, the dashboard pipeline, JobCard badges and analytics
// each hardcoded their own (different) palette for the same statuses — this
// unifies them so a status looks identical everywhere (visual consistency).
//
// Statuses are user-configurable (GET /api/users/statuses), so every lookup
// falls back to a neutral style for custom/unknown status names.

export interface StatusStyle {
  /** Soft pill: background + text + border. */
  badge: string;
  /** Small solid dot / indicator. */
  dot: string;
  /** Solid fill for progress bars. */
  bar: string;
  /** Kanban column tint: header background + border. */
  column: string;
  /** Concrete color for charts (SVG/recharts). Token-backed where possible so
   *  it adapts to light/dark; fixed hex for the two categorical-only statuses. */
  hex: string;
}

const NEUTRAL: StatusStyle = {
  badge: 'bg-muted text-muted-foreground border-border',
  dot: 'bg-muted-foreground',
  bar: 'bg-muted-foreground/50',
  column: 'bg-muted/40 border-border',
  hex: 'var(--muted-foreground)',
};

const STYLES: Record<string, StatusStyle> = {
  SAVED: {
    badge: 'bg-info/10 text-info border-info/25',
    dot: 'bg-info',
    bar: 'bg-info',
    column: 'bg-info/5 border-info/20',
    hex: 'var(--info)',
  },
  APPLIED: {
    badge: 'bg-warning/10 text-warning border-warning/25',
    dot: 'bg-warning',
    bar: 'bg-warning',
    column: 'bg-warning/5 border-warning/20',
    hex: 'var(--warning)',
  },
  ACCEPTED: {
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/25',
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
    column: 'bg-violet-500/5 border-violet-500/20',
    hex: '#8b5cf6',
  },
  INTERVIEW: {
    badge: 'bg-accent/10 text-accent border-accent/25',
    dot: 'bg-accent',
    bar: 'bg-accent',
    column: 'bg-accent/5 border-accent/20',
    hex: 'var(--accent)',
  },
  OFFER: {
    badge: 'bg-success/10 text-success border-success/25',
    dot: 'bg-success',
    bar: 'bg-success',
    column: 'bg-success/5 border-success/20',
    hex: 'var(--success)',
  },
  REJECTED: {
    badge: 'bg-danger/10 text-danger border-danger/25',
    dot: 'bg-danger',
    bar: 'bg-danger',
    column: 'bg-danger/5 border-danger/20',
    hex: 'var(--danger)',
  },
  WITHDRAWN: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-zinc-400',
    bar: 'bg-zinc-400',
    column: 'bg-muted/40 border-border',
    hex: '#71717a',
  },
};

/** Look up the shared style for a status name (case-insensitive), neutral fallback. */
export function statusStyle(name: string | null | undefined): StatusStyle {
  if (!name) return NEUTRAL;
  return STYLES[name.toUpperCase()] ?? NEUTRAL;
}
