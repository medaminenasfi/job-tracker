'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ExternalLink, MapPin, X } from 'lucide-react';
import { apiFetch, apiJson } from '@/lib/api';
import { Job, JobNote, JobStatus } from '@/lib/types';
import { ButtonLoader } from '@/components/ui/Loading';
import { StatusBadge } from '@/components/ui/Badge';
import { JobDescription } from '@/components/JobDescription';
import { DEFAULT_STATUS_NAMES, statusLabel, useJobStatuses } from '@/lib/useJobStatuses';

interface JobDetailsModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobDetailsModal({ job, isOpen, onClose }: JobDetailsModalProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<JobStatus>(job?.status || 'SAVED');
  const [noteMsg, setNoteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    cached?: boolean;
  } | null>(null);

  // Multiple-notes manager state. `newNote` backs the add box; `editingId` /
  // `editBody` back inline editing of one existing note at a time.
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { data: statusConfigs } = useJobStatuses();
  const statuses = statusConfigs?.map((item) => item.name) ?? DEFAULT_STATUS_NAMES;

  const jobId = job?.id;

  // The modal stays mounted while `job` swaps between cards, so re-sync the local
  // editors whenever a different job is opened. Without this, opening job B showed
  // job A's note/status and saving would overwrite the wrong record.
  useEffect(() => {
    setStatus(job?.status || 'SAVED');
    setNoteMsg(null);
    setNewNote('');
    setEditingId(null);
    setEditBody('');
    setMatchError(null);
    setMatchResult(
      job?.match_score != null
        ? {
            score: job.match_score,
            matchedSkills: job.match_skills_matched ?? [],
            missingSkills: job.match_skills_missing ?? [],
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, job?.match_score, job?.match_computed_at]);

  const [followUpValue, setFollowUpValue] = useState('');
  const followUpMutation = useMutation({
    mutationFn: (followUpAt: string | null) =>
      apiJson(`/api/jobs/${jobId}/follow-up`, {
        method: 'PATCH',
        body: JSON.stringify({ followUpAt }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const matchMutation = useMutation({
    mutationFn: () =>
      apiJson<{
        score: number;
        matchedSkills: string[];
        missingSkills: string[];
        cached?: boolean;
      }>(`/api/jobs/${jobId}/match`, { method: 'POST' }),
    onSuccess: (data) => {
      setMatchError(null);
      setMatchResult(data);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (e: Error) => setMatchError(e.message),
  });

  const notesQuery = useQuery({
    queryKey: ['jobNotes', jobId],
    queryFn: () => apiJson<JobNote[]>(`/api/jobs/${jobId}/notes`),
    enabled: !!jobId,
  });

  const invalidateNotes = () =>
    queryClient.invalidateQueries({ queryKey: ['jobNotes', jobId] });

  const updateJobMutation = useMutation({
    mutationFn: async (data: { status?: JobStatus }) => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update job');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete job');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onClose();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: (body: string) =>
      apiJson<JobNote>(`/api/jobs/${jobId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setNewNote('');
      setNoteMsg({ type: 'success', text: 'Note added' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to add note' }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      apiJson<JobNote>(`/api/jobs/${jobId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditBody('');
      setNoteMsg({ type: 'success', text: 'Note updated' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to update note' }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      apiFetch(`/api/jobs/${jobId}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      if (!res.ok) {
        setNoteMsg({ type: 'error', text: 'Failed to delete note' });
        return;
      }
      if (editingId) setEditingId(null);
      setNoteMsg({ type: 'success', text: 'Note deleted' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to delete note' }),
  });

  const busy =
    createNoteMutation.isPending ||
    updateNoteMutation.isPending ||
    deleteNoteMutation.isPending;

  const handleAddNote = () => {
    const body = newNote.trim();
    if (!body) return;
    setNoteMsg(null);
    createNoteMutation.mutate(body);
  };

  const handleSaveEdit = (noteId: string) => {
    const body = editBody.trim();
    if (!body) return;
    setNoteMsg(null);
    updateNoteMutation.mutate({ noteId, body });
  };

  const handleStatusChange = (newStatus: JobStatus) => {
    setStatus(newStatus);
    updateJobMutation.mutate({ status: newStatus });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this job?')) {
      deleteJobMutation.mutate();
    }
  };

  // Escape closes the dialog (Phase 11.4 keyboard support).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Keep Tab / Shift+Tab inside the dialog while it is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !job) return null;

  const notes = notesQuery.data ?? [];

  // The modal is portaled to document.body: PageTransition wraps pages in an
  // animated (transformed) container, and a transformed ancestor becomes the
  // containing block for position:fixed descendants — which made the backdrop
  // position relative to the scrolled page instead of the viewport and clipped
  // the header. Portaling to body keeps inset:0 truly viewport-relative.
  return createPortal(
    <div
      data-testid="job-details-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      {/* min-h-full centers the dialog when it fits and lets the backdrop
          scroll (instead of clipping) when the viewport is very short. */}
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-details-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-1rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-pop-in sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                {job.source || 'Job'}
              </span>
              <StatusBadge status={status} />
            </div>
            <h2 id="job-details-title" className="break-words text-lg font-bold leading-snug text-foreground sm:text-2xl">
              {job.title}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {job.company}{' '}
              <a href="/dashboard/companies" className="text-accent underline">
                view
              </a>
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close job details"
            title="Close"
            className="shrink-0 rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 min-w-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto p-4 sm:p-6 [scrollbar-gutter:stable]">
          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job information</h3>
              {job.location && (
                <span className="inline-flex max-w-full items-center gap-1 break-words text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {job.location}
                </span>
              )}
              {job.follow_up_at && job.status === 'APPLIED' && !job.follow_up_sent && new Date(job.follow_up_at) <= new Date() && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  Follow up due
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['Location', job.location],
                ['Salary', job.salary],
                ['Source', job.source],
                ['Employment type', job.employment_type],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/35 px-3 py-2.5">
                  <div className="text-xs font-medium text-muted-foreground">{label}</div>
                  <div className="mt-1 break-words text-sm font-medium text-foreground">{value || 'Not provided'}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Follow-up:</label>
              <input
                type="date"
                value={followUpValue}
                onChange={(e) => setFollowUpValue(e.target.value)}
                className="border border-input rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={() => followUpValue && followUpMutation.mutate(new Date(followUpValue).toISOString())}
                disabled={!followUpValue || followUpMutation.isPending}
                className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => followUpMutation.mutate(null)}
                disabled={followUpMutation.isPending}
                className="px-3 py-1.5 border border-border rounded-lg text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Disable
              </button>
              {followUpMutation.isError && (
                <span className="text-xs text-danger">{(followUpMutation.error as Error).message}</span>
              )}
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-base font-semibold text-foreground">
                AI Match {matchResult?.cached ? '(cached)' : ''}
              </h3>
              <button
                type="button"
                onClick={() => matchMutation.mutate()}
                disabled={matchMutation.isPending}
                className="px-3 py-1.5 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {matchMutation.isPending ? <ButtonLoader label="Matching..." /> : matchResult ? 'Recompute' : 'Compute match'}
              </button>
            </div>
            <div className="px-4 py-4 sm:px-5">
              {matchError && (
                <p className="rounded-lg border border-danger/25 bg-danger/5 p-3 text-sm text-danger">
                  Match unavailable: {matchError}
                </p>
              )}
              {!matchError && !matchResult && (
                <p className="text-sm text-muted-foreground">
                  Compute an AI match score from your profile skills.
                </p>
              )}
              {matchResult && (
                <div>
                  <div className="mb-3 inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
                    {matchResult.score}% match
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Matched skills</div>
                      <div className="flex flex-wrap gap-1">
                        {matchResult.matchedSkills.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded-full bg-success/15 text-success text-xs">{s}</span>
                        ))}
                        {matchResult.matchedSkills.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Missing skills</div>
                      <div className="flex flex-wrap gap-1">
                        {matchResult.missingSkills.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded-full bg-danger/15 text-danger text-xs">{s}</span>
                        ))}
                        {matchResult.missingSkills.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-base font-semibold text-foreground">Description</h3>
            </div>
            <div className="px-4 py-4 sm:px-5 [overflow-wrap:anywhere]">
              <JobDescription value={job.description} />
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">Notes</h3>
              {notesQuery.isLoading && <span className="text-xs text-muted-foreground">Loading notes...</span>}
            </div>

            <div className="mb-3 space-y-2">
              {notesQuery.isError && (
                <p className="rounded-lg border border-danger/25 bg-danger/5 p-3 text-sm text-danger">Failed to load notes.</p>
              )}
              {!notesQuery.isLoading && notes.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No notes yet.</p>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-border bg-muted/45 p-3"
                >
                  {editingId === note.id ? (
                    <div>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        className="w-full border border-input rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={busy || editBody.trim() === ''}
                          className="px-3 py-1.5 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors text-sm"
                        >
                          {updateNoteMutation.isPending ? <ButtonLoader label="Saving..." /> : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditBody('');
                          }}
                          disabled={busy}
                          className="px-3 py-1.5 bg-card text-foreground border border-input rounded-lg hover:bg-muted disabled:opacity-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words flex-1">
                        {note.body}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditBody(note.body);
                          }}
                          disabled={busy}
                          className="text-sm text-accent hover:text-accent-hover disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          disabled={busy}
                          className="text-sm text-danger hover:text-danger/80 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add a new note. */}
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              rows={3}
              placeholder="Add a note..."
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddNote}
                disabled={busy || newNote.trim() === ''}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors text-sm"
              >
                {createNoteMutation.isPending ? <ButtonLoader label="Adding..." /> : 'Add Note'}
              </button>
            </div>
            {noteMsg && (
              <p
                role="status"
                className={`mt-2 text-sm ${noteMsg.type === 'success' ? 'text-success' : 'text-danger'}`}
              >
                {noteMsg.text}
              </p>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Status:
              <select
                value={status}
                onChange={(event) => handleStatusChange(event.target.value as JobStatus)}
                disabled={updateJobMutation.isPending}
                className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {statuses.map((item) => (
                  <option key={item} value={item}>{statusLabel(item)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteJobMutation.isPending}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
            >
              {deleteJobMutation.isPending ? <ButtonLoader label="Deleting..." /> : 'Delete'}
            </button>
          </div>

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open original job
            </a>
          )}
        </footer>
      </div>
      </div>
    </div>,
    document.body,
  );
}
