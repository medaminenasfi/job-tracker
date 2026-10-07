'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ImageOff } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { AdminCvTemplate, TemplateLanguage } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Toast, useToast } from '@/components/Toast';
import { SplitPreviewPane } from '@/components/SplitPreviewPane';
import { LatexEditor } from '@/components/LatexEditor';
import { activationChecklist } from '@/lib/activation-checklist';
import { EXAMPLE_CV_TEMPLATE } from '@/lib/cvTemplateExample';

// The shipped, sandbox-verified example (see lib/cvTemplateExample). A brand-new
// template starts from this rather than a bare scaffold: it compiles as-is, uses
// only allowlisted packages and documented placeholders, and demonstrates the
// layout conventions (accent headings, one-page fit) an author should keep.
const DEFAULT_SOURCE = EXAMPLE_CV_TEMPLATE;

interface PlaceholderInfo {
  placeholders: {
    name: string;
    token: string;
    /** Human label, e.g. "Full name" — from the API's field metadata. */
    label: string;
    /** Short authoring guidance shown under the token. */
    hint: string;
    /** Whether the field is expected to hold several lines (one entry per line). */
    multiline: boolean;
  }[];
}

/** Whitelisted compile-failure detail: a line number and a safe description. */
interface LatexError {
  line?: number;
  message: string;
}

interface PreviewResult {
  placeholders: string[];
  latex: string;
  /** Base64 PNG data URL rendered in the sandbox, or null when unavailable. */
  image: string | null;
  /** User-safe note when the image could not be rendered (sandbox down, etc.). */
  error: string | null;
  /**
   * Present when the template's own source is at fault. The raw pdflatex log is
   * never returned; this is a line number and a whitelisted message, which is
   * what lets the editor mark the offending line.
   */
  latexError?: LatexError | null;
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
  // The exact source that last compiled into an image. Storing the source, not
  // a boolean, means an edit after a successful preview correctly invalidates
  // the check — a template that compiled before the last keystroke may not
  // compile after it.
  const [compiledSource, setCompiledSource] = useState<string | null>(null);

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

  const editMutation = useMutation({
    mutationFn: (id: string) => apiJson<AdminCvTemplate>(`/api/admin/cv-templates/${id}`),
    onSuccess: (template) => {
      setPreview(null);
      // Opening a different template invalidates the previous template's
      // verified-compile state; the checklist must reflect this source only.
      setCompiledSource(null);
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

  // Gate activation on the requirements, and keep the button enabled either way:
  // a disabled button does not say *why*, so the list sits next to it instead.
  const checklist = form
    ? activationChecklist(
        form.name,
        form.latexSource,
        compiledSource !== null && compiledSource === form.latexSource,
      )
    : null;

  // Server-side errors name the offending package or primitive; keep them
  // verbatim in the toast so the admin sees exactly what was rejected.
  const handlePreviewResult = (result: PreviewResult) => {
    setPreview(result);
    if (result.image) setCompiledSource(form?.latexSource ?? null);
  };

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
        <div className="mb-6 grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
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
                <div className="flex flex-wrap items-center gap-3">
                  {/* Replaces the editor contents with the shipped, verified example —
                      the fastest way for an author to start from something that fits. */}
                  <button
                    type="button"
                    onClick={() => update({ latexSource: DEFAULT_SOURCE })}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Insert example
                  </button>
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
              </div>
              {/* Line numbers plus a marker on the failing line: pdflatex names a line, and
                  an author needs to be able to see it rather than count. */}
              <LatexEditor
                ref={sourceRef}
                aria-label="LaTeX source"
                value={form.latexSource}
                errorLine={preview?.latexError?.line}
                onChange={(e) => update({ latexSource: e.target.value })}
              />
              {preview?.latexError && (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {preview.latexError.line
                      ? `Line ${preview.latexError.line}: ${preview.latexError.message}`
                      : preview.latexError.message}
                  </span>
                </p>
              )}
              {/* Field reference: every placeholder the CV builder fills, with its
                  label, an authoring hint and whether it expects several lines.
                  Clicking a token inserts it at the caret, so an author never has
                  to remember the exact spelling — and the labels/hints come from
                  the same API metadata the builder uses, so they cannot drift. */}
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Available fields
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click a token to insert it at the cursor. These are the only
                  placeholders the builder fills in.
                </p>
                <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {(placeholdersQuery.data?.placeholders ?? []).map((p) => (
                    <li key={p.name} className="flex items-start gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {p.label}
                          </span>
                          {p.multiline && (
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                              multi-line
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.hint}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => insertToken(p.token)}
                        title={`Insert ${p.token}`}
                        className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs text-foreground hover:bg-muted/70"
                      >
                        {p.token}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Before this can go live
              </p>
              <ul className="mt-2 space-y-1.5">
                {checklist?.met.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
                {checklist?.missing.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-foreground">
                    <span
                      aria-hidden
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-danger"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update({ isActive: e.target.checked })}
              />
              Active (visible to users)
            </label>
            {/* Not a hard block: an admin part-way through an edit must still be able to
                save, and the server does not forbid activating early. The
                consequence is stated so the choice is informed. */}
            {form.isActive && checklist && checklist.missing.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {checklist.missing.some((item) => item.includes('preview'))
                  ? 'It is active with items still outstanding above, so users may pick a template that does not render.'
                  : 'It is active with items still outstanding above, so users may see a blank field.'}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => saveMutation.mutate(form)}
                loading={saveMutation.isPending}
                disabled={!form.name.trim() || !form.latexSource.trim()}
              >
                {form.id ? 'Save changes' : 'Create template'}
              </Button>
              {!form.name.trim() && (
                <p className="self-center text-xs text-muted-foreground">
                  A name is required — the gallery shows no other identifier.
                </p>
              )}
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

          {/* Live preview: the same sandbox compile as a final PDF, rendered to a
              low-res PNG against the shared sample data and debounced as the
              admin types. Nothing here is saved until [Create/Save] is pressed. */}
          <div className="lg:sticky lg:top-6">
            <SplitPreviewPane
              signature={form.latexSource}
              enabled={Boolean(form.latexSource.trim())}
              title="Live preview (sample data)"
              idleLabel="Write a template to see a live preview."
              fetchPreview={(signal) =>
                apiJson<PreviewResult>('/api/admin/cv-templates/preview', {
                  method: 'POST',
                  body: JSON.stringify({ latex_source: form.latexSource }),
                  signal,
                })
              }
              onResult={handlePreviewResult}
            />
          </div>
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
                    {/* A gallery with no thumbnails is unreadable, so an explicit placeholder
                      states the image is missing rather than leaving a gap. */}
                    {t.preview_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin can preview template image
                      <img
                        src={t.preview_image_url}
                        alt={`${t.name} preview`}
                        className="mt-2 h-20 w-auto rounded border border-border object-contain"
                      />
                    ) : (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" aria-hidden />
                        No preview image
                      </span>
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
