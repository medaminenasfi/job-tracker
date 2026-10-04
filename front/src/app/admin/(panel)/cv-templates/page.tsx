'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AdminCvTemplate, TemplateLanguage } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Toast, useToast } from '@/components/Toast';

const DEFAULT_SOURCE = `\\documentclass[11pt]{article}
\\begin{document}

{\\LARGE {{fullName}}}

{{headline}}
{{email}} \\quad {{phone}} \\quad {{links}}

\\section*{Experience}
{{experience}}

\\section*{Education}
{{education}}

\\section*{Skills}
{{skills}}

\\end{document}
`;

interface PlaceholderInfo {
  placeholders: { name: string; token: string }[];
}

interface PreviewResult {
  placeholders: string[];
  latex: string;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
  previewImageUrl: string;
  language: TemplateLanguage;
  isActive: boolean;
  latexSource: string;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  description: '',
  previewImageUrl: '',
  language: 'en',
  isActive: true,
  latexSource: DEFAULT_SOURCE,
};

export default function AdminCvTemplatesPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, hideToast } = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCvTemplate | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  const listQuery = useQuery({
    queryKey: ['admin-cv-templates'],
    queryFn: () => apiJson<AdminCvTemplate[]>('/api/admin/cv-templates?include_inactive=true'),
  });

  const placeholdersQuery = useQuery({
    queryKey: ['admin-cv-template-placeholders'],
    queryFn: () => apiJson<PlaceholderInfo>('/api/admin/cv-templates/placeholders'),
    // The allowed placeholder set is fixed by the API; fetch once per session.
    staleTime: Infinity,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-cv-templates'] });

  const saveMutation = useMutation({
    mutationFn: (state: FormState) => {
      const body = JSON.stringify({
        name: state.name,
        description: state.description,
        preview_image_url: state.previewImageUrl,
        language: state.language,
        is_active: state.isActive,
        latex_source: state.latexSource,
      });
      return state.id
        ? apiJson<AdminCvTemplate>(`/api/admin/cv-templates/${state.id}`, { method: 'PATCH', body })
        : apiJson<AdminCvTemplate>('/api/admin/cv-templates', { method: 'POST', body });
    },
    onSuccess: (saved: AdminCvTemplate) => {
      showToast(saved.is_active ? 'Template saved' : 'Template saved (inactive)');
      setForm(null);
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiJson(`/api/admin/cv-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      }),
    onSuccess: () => { showToast('Template updated'); invalidate(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/admin/cv-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => { showToast('Template deleted'); setConfirmDelete(null); invalidate(); },
    onError: (e: Error) => { showToast(e.message, 'error'); setConfirmDelete(null); },
  });

  const previewMutation = useMutation({
    mutationFn: (latexSource: string) =>
      apiJson<PreviewResult>('/api/admin/cv-templates/preview', {
        method: 'POST',
        body: JSON.stringify({ latex_source: latexSource }),
      }),
    onSuccess: (result) => setPreview(result),
    onError: (e: Error) => { setPreview(null); showToast(e.message, 'error'); },
  });

  const editMutation = useMutation({
    mutationFn: (id: string) => apiJson<AdminCvTemplate>(`/api/admin/cv-templates/${id}`),
    onSuccess: (template) => {
      setPreview(null);
      setForm({
        id: template.id,
        name: template.name,
        description: template.description ?? '',
        previewImageUrl: template.preview_image_url ?? '',
        language: template.language,
        isActive: template.is_active,
        latexSource: template.latex_source ?? '',
      });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const update = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  const insertToken = (token: string) => {
    const textarea = sourceRef.current;
    const source = form?.latexSource ?? '';
    const at = textarea ? textarea.selectionStart : source.length;
    update({ latexSource: source.slice(0, at) + token + source.slice(at) });
  };

  const handleTexUpload = async (file: File | undefined) => {
    if (!file || !form) return;
    update({ latexSource: await file.text() });
    showToast(`${file.name} loaded`);
  };

  const templates = listQuery.data ?? [];

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CV Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            LaTeX templates users build their CV from. Only the placeholders below are allowed.
          </p>
        </div>
        {form ? (
          <Button
            variant="outline"
            onClick={() => { setForm(null); setPreview(null); }}
          >
            Close editor
          </Button>
        ) : (
          <Button onClick={() => { setPreview(null); setForm(emptyForm); }}>
            New template
          </Button>
        )}
      </div>

      {form && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="Classic — single column"
                />
              )}
            </Field>
            <Field label="Language" hint="Used to filter the template gallery by locale.">
              {(id) => (
                <Select
                  id={id}
                  value={form.language}
                  onChange={(e) => update({ language: e.target.value as TemplateLanguage })}
                >
                  <option value="en">English (en)</option>
                  <option value="fr">French (fr)</option>
                </Select>
              )}
            </Field>
            <Field label="Description" className="sm:col-span-2">
              {(id) => (
                <Textarea
                  id={id}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Clean single-page layout for technical roles"
                />
              )}
            </Field>
            <Field label="Preview image URL" className="sm:col-span-2" hint="Optional image shown in the template gallery.">
              {(id) => (
                <Input
                  id={id}
                  value={form.previewImageUrl}
                  onChange={(e) => update({ previewImageUrl: e.target.value })}
                  placeholder="https://cdn.example.com/templates/classic.png"
                />
              )}
            </Field>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                LaTeX source
              </span>
              <label className="cursor-pointer text-xs font-semibold text-accent hover:underline">
                Upload .tex
                <input
                  type="file"
                  accept=".tex,text/plain"
                  className="sr-only"
                  onChange={(e) => {
                    void handleTexUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <Textarea
              ref={sourceRef}
              aria-label="LaTeX source"
              value={form.latexSource}
              onChange={(e) => update({ latexSource: e.target.value })}
              className="min-h-[320px] font-mono text-xs"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(placeholdersQuery.data?.placeholders ?? []).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => insertToken(p.token)}
                  className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground hover:bg-muted/70"
                >
                  {p.token}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update({ isActive: e.target.checked })}
            />
            Active (visible to users)
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate(form)}
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || !form.latexSource.trim()}
            >
              {form.id ? 'Save changes' : 'Create template'}
            </Button>
            <Button
              variant="outline"
              onClick={() => previewMutation.mutate(form.latexSource)}
              loading={previewMutation.isPending}
              disabled={!form.latexSource.trim()}
            >
              Preview with sample data
            </Button>
          </div>

          {preview && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rendered source ({preview.placeholders.length} placeholder
                {preview.placeholders.length === 1 ? '' : 's'} replaced)
              </p>
              <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
                {preview.latex}
              </pre>
            </div>
          )}
        </div>
      )}

      {listQuery.isLoading && <div className="text-muted-foreground">Loading...</div>}
      {listQuery.isError && (
        <div className="text-red-600" role="alert">
          Failed to load templates:{' '}
          {listQuery.error instanceof Error ? listQuery.error.message : 'unknown error'}
        </div>
      )}

      {!listQuery.isLoading && templates.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
          No templates yet. Create the first one to start building CVs.
        </div>
      )}

      {templates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Language</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.language}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.latex_length ? `${t.latex_length} chars` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        t.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => editMutation.mutate(t.id)}
                        disabled={editMutation.isPending}
                        className="text-accent hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate({ id: t.id, isActive: !t.is_active })}
                        disabled={toggleMutation.isPending}
                        className="text-amber-600 hover:underline"
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(t)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-card p-6">
            <h2 className="mb-2 text-lg font-bold text-foreground">Delete template</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Permanently delete <span className="font-semibold">{confirmDelete.name}</span>? CVs already
              built from it keep their generated file. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
