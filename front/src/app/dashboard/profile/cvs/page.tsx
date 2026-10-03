'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { apiFetch, apiJson, extractMessage } from '@/lib/api';
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

  const downloadMutation = useMutation({
    mutationFn: async (cv: Cv) => {
      const res = await apiFetch(`/api/cvs/${cv.id}/file`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      // The endpoint sets Content-Disposition with the real filename.
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] ?? `cv-${cv.id}`;
      a.click();
      URL.revokeObjectURL(url);
    },
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
          <Field label="Label">
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
            disabled={!file || !label.trim()}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload CV'}
          </Button>
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
                          {cv.source === 'uploaded' ? 'Uploaded' : cv.source}
                          {cv.text_length != null &&
                            ` · ${cv.text_length.toLocaleString()} chars extracted`}
                          {' · '}
                          {new Date(cv.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
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
