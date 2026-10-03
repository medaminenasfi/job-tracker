'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronDown, Search } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { SectionLoader } from '@/components/ui/Loading';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { statusStyle } from '@/lib/statusStyles';

type Company = {
  name: string;
  count: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
};

type CompanyJob = {
  id: string;
  title: string;
  company: string;
  status: string;
  created_at: string;
};

// Status pills reuse the shared palette so a status is the same color here as
// on the board, dashboard and job modal (no per-page hardcoded colors).
const COUNTS: { key: keyof Company; status: string; label: string }[] = [
  { key: 'applied', status: 'APPLIED', label: 'Applied' },
  { key: 'interview', status: 'INTERVIEW', label: 'Interview' },
  { key: 'offer', status: 'OFFER', label: 'Offer' },
  { key: 'rejected', status: 'REJECTED', label: 'Rejected' },
];

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const {
    data: companies = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => apiJson('/api/companies'),
  });
  const {
    data: jobs = [],
    isLoading: jobsLoading,
    isError: jobsError,
  } = useQuery<CompanyJob[]>({
    queryKey: ['companyJobs', selected],
    queryFn: () => apiJson(`/api/companies/${encodeURIComponent(selected!)}/jobs`),
    enabled: !!selected,
  });

  if (isLoading) return <SectionLoader label="Loading companies..." />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Couldn't load companies"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Companies" subtitle="All applications grouped by company" />

      <div className="relative w-full max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
          aria-label="Search companies"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No companies yet"
            description="Save a job and its company will appear here, grouped with its pipeline counts."
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`No companies match "${search}".`}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const isOpen = selected === c.name;
            const panelId = `company-jobs-${c.name.replace(/\s+/g, '-').toLowerCase()}`;
            return (
              <Card key={c.name} hover className="min-w-0 p-4">
                <button
                  type="button"
                  onClick={() => setSelected(isOpen ? null : c.name)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <span className="truncate font-semibold text-foreground">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    {c.count} {c.count === 1 ? 'job' : 'jobs'}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </span>
                </button>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {COUNTS.map(({ key, status, label }) => (
                    <Badge key={key} className={statusStyle(status).badge}>
                      {label} {c[key] as number}
                    </Badge>
                  ))}
                </div>

                {isOpen && (
                  <div id={panelId} className="mt-3 border-t border-border pt-3">
                    {jobsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading jobs…</p>
                    ) : jobsError ? (
                      <p className="text-sm text-danger">Failed to load jobs for this company.</p>
                    ) : jobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No jobs.</p>
                    ) : (
                      <ul className="space-y-2">
                        {jobs.map((j) => (
                          <li key={j.id} className="flex items-start justify-between gap-2 text-sm">
                            <span className="min-w-0 break-words text-foreground">{j.title}</span>
                            <StatusBadge status={j.status} withDot={false} className="shrink-0" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
