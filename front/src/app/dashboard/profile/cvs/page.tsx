'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Download, Pencil, Plus, Star, Trash2, Wand2, X, Sparkles } from 'lucide-react';
import { apiFetch, apiJson, downloadApiFile, extractMessage } from '@/lib/api';
import { SectionLoader } from '@/components/ui/Loading';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ErrorState } from '@/components/ui/EmptyState';
import type { Cv } from '@/lib/types';

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function CvsPage() {
  const queryClient = useQueryClient();
  const { data: cvs = [], isLoading, isError, refetch } = useQuery<Cv[]>({
    queryKey: ['cvs'],
    queryFn: () => apiJson('/api/cvs'),
  });
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a PDF or DOCX file first');
      const form = new FormData();
      form.append('file', file);
      form.append('label', label.trim());
      const res = await apiFetch('/api/cvs', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(extractMessage(body, 'Upload failed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      setLabel('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      flash('success', 'CV uploaded and its text extracted.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const toggleDefaultMutation = useMutation({
    mutationFn: (cv: Cv) =>
      apiJson(`/api/cvs/${cv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_default: !cv.is_default }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cvs'] }),
    onError: (e: Error) => flash('error', e.message),
  });

  const renameMutation = useMutation({
    mutationFn: () =>
      apiJson(`/api/cvs/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: editLabel.trim() }),
      }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/cvs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      flash('success', 'CV deleted.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const parseMutation = useMutation({
    mutationFn: (cv: Cv) =>
      apiJson(`/api/cvs/${cv.id}/parse?method=ai`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      flash('success', 'AI parsing complete.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  // Rule-based re-parse is free and re-extracts the text from the stored file,
  // so it is the way to repair a row parsed by an older extractor — not AI.
  const reparseMutation = useMutation({
    mutationFn: (cv: Cv) =>
      apiJson(`/api/cvs/${cv.id}/parse?method=rule`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      flash('success', 'Re-parsed.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const downloadMutation = useMutation({
    mutationFn: (cv: Cv) =>
      downloadApiFile(`/api/cvs/${cv.id}/file`, `cv-${cv.id}`),
    onError: (e: Error) => flash('error', e.message),
  });

  if (isLoading) return <SectionLoader label="Loading your CVs..." />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Couldn't load your CVs"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My CVs"
        subtitle="Upload a PDF or DOCX — it's stored with its extracted text and can be attached to applications"
        actions={
          <Link href="/cv-builder" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Wand2 className="h-4 w-4" aria-hidden />
            Build a CV
          </Link>
        }
      />

      {message && (
        <Alert tone={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <CardTitle
            icon={<Plus className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            Upload a CV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-5 sm:px-6">
          <Field
            label="Label (optional)"
            hint="Leave it empty and we'll name it after the name and headline found in the file."
          >
            {(id) => (
              <Input
                id={id}
                type="text"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Full-Stack Developer"
              />
            )}
          </Field>

          <Field label="File (PDF or DOCX, max 5 MB)">
            {(id) => (
              <Input
                id={id}
                type="file"
                accept={ACCEPT}
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            )}
          </Field>

          <Button
            type="button"
            onClick={() => uploadMutation.mutate()}
            loading={uploadMutation.isPending}
            disabled={!file}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload CV'}
          </Button>
          {!file && (
            <p className="text-xs text-muted-foreground">
              Choose a PDF or DOCX file to upload.
            </p>
          )}
        </CardContent>
      </Card>

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <CardTitle
            icon={<Star className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            Saved CVs ({cvs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          {cvs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No CVs yet — upload one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {cvs.map((cv) => (
                <li
                  key={cv.id}
                  className="rounded-lg border border-border bg-muted/35 px-3 py-2.5"
                >
                  {editingId === cv.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="CV label"
                        value={editLabel}
                        maxLength={120}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (editLabel.trim()) renameMutation.mutate();
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-input px-2 py-1 text-sm text-foreground focus:outline-none focus:border-ring"
                      />
                      <button
                        type="button"
                        aria-label="Save label"
                        onClick={() => editLabel.trim() && renameMutation.mutate()}
                        disabled={renameMutation.isPending || !editLabel.trim()}
                        className="rounded-lg p-2 text-success transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {cv.label}
                            {cv.is_default && (
                              <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                                Default
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cv.source === 'built' ? 'Generated' : 'Uploaded'}
                            {cv.text_length != null &&
                              ` · ${cv.text_length.toLocaleString()} chars extracted`}
                            {' · '}
                            {new Date(cv.created_at).toLocaleDateString()}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            {cv.source === 'built' ? (
                              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                                Built from template
                              </span>
                            ) : (
                              <>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    cv.parse_status === 'parsed'
                                      ? 'bg-success/15 text-success'
                                      : cv.parse_status === 'partial'
                                        ? 'bg-warning/15 text-warning'
                                        : cv.parse_status === 'failed'
                                          ? 'bg-danger/15 text-danger'
                                          : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {cv.parse_status === 'parsed'
                                    ? 'Parsed'
                                    : cv.parse_status === 'partial'
                                      ? 'Partial'
                                      : cv.parse_status === 'failed'
                                        ? 'Failed'
                                        : 'Pending'}
                                </span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {cv.parse_method === 'ai' ? 'AI parsing' : 'Rule-based'}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(expandedId === cv.id ? null : cv.id)
                            }
                            aria-label={
                              expandedId === cv.id
                                ? `Hide parsed data for ${cv.label}`
                                : `Show parsed data for ${cv.label}`
                            }
                            aria-expanded={expandedId === cv.id}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                expandedId === cv.id ? 'rotate-180' : ''
                              }`}
                              aria-hidden
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDefaultMutation.mutate(cv)}
                            aria-label={cv.is_default ? 'Unset default CV' : 'Set as default CV'}
                            title={cv.is_default ? 'Unset default' : 'Set as default'}
                            className={`rounded-lg p-2 transition-colors hover:bg-muted ${
                              cv.is_default ? 'text-accent' : 'text-muted-foreground'
                            }`}
                          >
                            <Star className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(cv.id);
                              setEditLabel(cv.label);
                            }}
                            aria-label={`Rename ${cv.label}`}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMutation.mutate(cv)}
                            aria-label={`Download ${cv.label}`}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(cv.id)}
                            aria-label={`Delete ${cv.label}`}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>

                      {expandedId === cv.id && (
                        <div className="mt-3 border-t border-border pt-3">
                          {cv.structured_data &&
                          (cv.structured_data.skills.length > 0 ||
                            cv.structured_data.experience.length > 0 ||
                            cv.structured_data.education.length > 0 ||
                            cv.structured_data.fullName ||
                            cv.structured_data.email ||
                            cv.structured_data.phone) ? (
                            <div className="space-y-3">
                              {(cv.structured_data.fullName ||
                                cv.structured_data.email ||
                                cv.structured_data.phone ||
                                (cv.structured_data.links?.length ?? 0) > 0) && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                  {cv.structured_data.fullName && (
                                    <span className="font-medium text-foreground">
                                      {cv.structured_data.fullName}
                                    </span>
                                  )}
                                  {cv.structured_data.email && (
                                    <span className="text-muted-foreground">
                                      {cv.structured_data.email}
                                    </span>
                                  )}
                                  {cv.structured_data.phone && (
                                    <span className="text-muted-foreground">
                                      {cv.structured_data.phone}
                                    </span>
                                  )}
                                  {cv.structured_data.links?.map((link) => (
                                    <a
                                      key={link}
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="break-all text-accent hover:underline"
                                    >
                                      {link}
                                    </a>
                                  ))}
                                </div>
                              )}

                              {cv.structured_data.skills.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Skills
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {cv.structured_data.skills.map((skill) => (
                                      <span
                                        key={skill}
                                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {cv.structured_data.experience.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Experience
                                  </p>
                                  <ul className="space-y-1.5">
                                    {cv.structured_data.experience.map((entry, i) => (
                                      <li key={i} className="text-sm">
                                        <p className="break-words text-foreground">
                                          {entry.text}
                                        </p>
                                        {entry.dateRange && (
                                          <p className="text-xs text-muted-foreground">
                                            {entry.dateRange}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {cv.structured_data.education.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Education
                                  </p>
                                  <ul className="space-y-1.5">
                                    {cv.structured_data.education.map((entry, i) => (
                                      <li key={i} className="text-sm">
                                        <p className="break-words text-foreground">
                                          {entry.text}
                                        </p>
                                        {entry.dateRange && (
                                          <p className="text-xs text-muted-foreground">
                                            {entry.dateRange}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No recognizable sections found — the raw text is
                              still stored.
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                            {cv.source === 'built' ? (
                              <span className="text-xs text-muted-foreground">
                                Generated from a template — edit it in the CV
                                Builder to change the content.
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => reparseMutation.mutate(cv)}
                                  disabled={
                                    reparseMutation.isPending ||
                                    parseMutation.isPending
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                >
                                  {reparseMutation.isPending
                                    ? 'Re-parsing...'
                                    : 'Re-parse'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => parseMutation.mutate(cv)}
                                  disabled={parseMutation.isPending}
                                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
                                >
                                  <Sparkles className="h-4 w-4" aria-hidden />
                                  {parseMutation.isPending
                                    ? 'Parsing with AI...'
                                    : 'Try AI Parsing'}
                                </button>
                                {cv.parse_method === 'rule_based' && (
                                  <span className="text-xs text-muted-foreground">
                                    Didn&apos;t catch everything? AI parsing handles
                                    unusual formats better.
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
