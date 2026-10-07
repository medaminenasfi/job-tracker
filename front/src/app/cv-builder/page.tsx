'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Wand2,
  Plus,
  Trash2,
  Edit2,
  X,
} from 'lucide-react';
import { apiJson, downloadApiFile } from '@/lib/api';
import type {
  Cv,
  CvEntry,
  CvStructuredData,
  CvTemplate,
  CvTemplateField,
  GeneratedCv,
  Profile,
} from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { DashboardGuard } from '@/components/DashboardGuard';
import { SectionLoader } from '@/components/ui/Loading';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SplitPreviewPane } from '@/components/SplitPreviewPane';
// --- Experience Entry Modal Component ---------------------------------------
// A self-contained editor: it keeps its own draft so typing never mutates the
// saved list, validates once when the user submits, and hands the finished
// entry back. The parent only opens it (with the entry to edit, or a blank one)
// and commits the result.
interface ExperienceEntryModalProps {
  entry: ExperienceEntry;
  isNew: boolean;
  onClose: () => void;
  onSave: (entry: ExperienceEntry) => void;
}

function ExperienceEntryModal({
  entry,
  isNew,
  onClose,
  onSave,
}: ExperienceEntryModalProps) {
  const [draft, setDraft] = useState<ExperienceEntry>(entry);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ExperienceEntry, string>>
  >({});

  // Re-seed the draft each time a (different) entry is opened. `entry` is the
  // object the parent stored on open, so its identity is stable while the modal
  // stays open — this runs once per open and never clobbers in-progress typing.
  useEffect(() => {
    setDraft(entry);
    setErrors({});
  }, [entry]);

  const update = (patch: Partial<ExperienceEntry>) =>
    setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    const nextErrors = validateEntryForm(draft);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(draft);
  }

  const years = Array.from(
    { length: 30 },
    (_, i) => new Date().getFullYear() - i,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-card shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="entry-modal-title" className="text-lg font-semibold">
            {isNew ? 'Add experience' : 'Edit experience'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-4">
          <Field label="Company" hint="e.g. Acme Corp" error={errors.company}>
            {(id) => (
              <Input
                id={id}
                value={draft.company}
                onChange={(e) => update({ company: e.target.value })}
                invalid={!!errors.company}
                placeholder="Company name"
              />
            )}
          </Field>
          <Field
            label="Role"
            hint="e.g. Senior Full-Stack Engineer"
            error={errors.role}
          >
            {(id) => (
              <Input
                id={id}
                value={draft.role}
                onChange={(e) => update({ role: e.target.value })}
                invalid={!!errors.role}
                placeholder="Your title"
              />
            )}
          </Field>
          <Field label="Start date">
            {(id) => (
              <div className="flex gap-2" id={id}>
                <Select
                  value={draft.startMonth}
                  onChange={(e) => update({ startMonth: e.target.value })}
                  className="w-28"
                  aria-label="Start month"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
                <Select
                  value={draft.startYear}
                  onChange={(e) => update({ startYear: e.target.value })}
                  className="w-28"
                  aria-label="Start year"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </Select>
              </div>
            )}
          </Field>
          <Field label="End date">
            {(id) => (
              <div className="flex items-end gap-2" id={id}>
                <div className="flex gap-2 flex-1">
                  <Select
                    value={draft.endMonth}
                    onChange={(e) => update({ endMonth: e.target.value })}
                    className="w-28"
                    aria-label="End month"
                    disabled={draft.current}
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                  <Select
                    value={draft.endYear}
                    onChange={(e) => update({ endYear: e.target.value })}
                    className="w-28"
                    aria-label="End year"
                    disabled={draft.current}
                  >
                    <option value="">Year</option>
                    {years.map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-center gap-2 shrink-0 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.current}
                    onChange={(e) =>
                      update({
                        current: e.target.checked,
                        endMonth: e.target.checked ? '' : draft.endMonth,
                        endYear: e.target.checked ? '' : draft.endYear,
                      })
                    }
                  />
                  Present
                </label>
              </div>
            )}
          </Field>
          {errors.endYear && (
            <p className="text-xs text-destructive">{errors.endYear}</p>
          )}
          <Field
            label="Description"
            hint="Key achievements, technologies, scope"
            error={errors.description}
          >
            {(id) => (
              <Textarea
                id={id}
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                invalid={!!errors.description}
                rows={3}
                placeholder="Led the team that built…"
              />
            )}
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            {isNew ? 'Add experience' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// The compile runs in a container, so poll until it settles rather than
// holding the request open.
const POLL_MS = 1500;
const MAX_POLLS = 120;

// A dated entry carries a four-digit year. Used only as a non-blocking nudge.
function hasLikelyDateRange(line: string): boolean {
  return /\b(19|20)\d{2}\b/.test(line);
}

// --- Structured experience entries -----------------------------------------
// The template only receives one `{{experience}}` string. The UI lets the user
// manage entries as structured rows (company, role, dates, description), and
// we combine them into the single string at build time.
interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  startMonth: string; // '1'-'12' or ''
  startYear: string;  // '2024' or ''
  endMonth: string;   // '1'-'12' or ''
  endYear: string;    // '2024' or ''
  current: boolean;   // 'Present' checkbox
  description: string;
}

const EMPTY_EXPERIENCE_ENTRY: ExperienceEntry = {
  id: '',
  company: '',
  role: '',
  startMonth: '',
  startYear: '',
  endMonth: '',
  endYear: '',
  current: false,
  description: '',
};

const MONTHS = [
  { value: '', label: 'Month' },
  { value: '1', label: 'Jan' },
  { value: '2', label: 'Feb' },
  { value: '3', label: 'Mar' },
  { value: '4', label: 'Apr' },
  { value: '5', label: 'May' },
  { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' },
  { value: '8', label: 'Aug' },
  { value: '9', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

function formatDateRange(entry: ExperienceEntry): string {
  const start = [entry.startMonth ? MONTHS.find(m => m.value === entry.startMonth)?.label : null, entry.startYear].filter(Boolean).join(' ');
  const end = entry.current
    ? 'Present'
    : [entry.endMonth ? MONTHS.find(m => m.value === entry.endMonth)?.label : null, entry.endYear].filter(Boolean).join(' ');
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
}

/** Combine structured entries into the single string the template expects. */
function buildExperienceText(entries: ExperienceEntry[]): string {
  return entries
    .filter(e => e.company.trim() || e.role.trim() || e.description.trim())
    .map(e => {
      const startYear = e.startYear;
      const dateStr = formatDateRange(e);
      // Only append the date range if the description doesn't already contain the start year
      const parts = [
        e.role && e.company ? `${e.role}, ${e.company}` : e.role || e.company,
        e.description,
        startYear && !e.description.includes(startYear) ? `(${dateStr})` : undefined,
      ].filter(Boolean);
      return parts.join(' — ');
    })
    .join('\n');
}

// The parsers only ever emit a raw text block per entry (see cvEntrySchema:
// `text` + optional `dateRange`); they never decompose role vs company. So a
// pre-filled entry arrives with an empty role/company and the whole block in
// `description`. Titling the card with the first non-empty line — and previewing
// the lines after it — is what stops every pre-filled row reading "Untitled
// entry". Once the user fills Role/Company in the modal those take over, and the
// preview reverts to the full description.
function entryTitle(entry: ExperienceEntry): string {
  if (entry.role && entry.company) return `${entry.role} — ${entry.company}`;
  if (entry.role) return entry.role;
  if (entry.company) return entry.company;
  const firstLine = entry.description.split('\n').find((l) => l.trim());
  return firstLine?.trim() || 'Untitled entry';
}

function entryBody(entry: ExperienceEntry): string {
  if (entry.role.trim() || entry.company.trim()) return entry.description.trim();
  const lines = entry.description.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim());
  if (firstIdx === -1) return '';
  return lines.slice(firstIdx + 1).join('\n').trim();
}

// An entry needs at least one identifying field, and its dates must not run
// backwards. Dates themselves stay optional: plenty of CVs list only a start
// year or an open-ended "Present", and forcing an end date blocked quick adds.
function validateEntryForm(
  form: ExperienceEntry,
): Partial<Record<keyof ExperienceEntry, string>> {
  const errors: Partial<Record<keyof ExperienceEntry, string>> = {};
  if (!form.company.trim() && !form.role.trim() && !form.description.trim()) {
    errors.company = 'Add at least a company, role, or description';
  }
  if (form.startYear && form.endYear && !form.current) {
    const start = parseInt(form.startYear, 10);
    const end = parseInt(form.endYear, 10);
    if (!isNaN(start) && !isNaN(end) && start > end) {
      errors.endYear = 'End year cannot be before start year';
    }
  }
  return errors;
}

// Parse status shown next to a saved CV so the user knows what they are
// pre-filling from before reading the copied content.
function formatParseStatus(
  status?: 'pending' | 'parsed' | 'partial' | 'failed',
): string {
  switch (status) {
    case 'parsed':
      return 'Parsed';
    case 'partial':
    case 'failed':
      return 'Needs review';
    default:
      return 'Plain text only';
  }
}

// Short date suffix for the Saved CV dropdown: several uploads share a label
// (often the candidate's own name repeated), so the created date is what tells
// two entries apart.
function formatCvDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Mirrors the backend's per-field caps (buildCvFieldsSchema) so the UI rejects
// an over-long value before it costs a compile.
const FIELD_META: {
  name: CvTemplateField;
  label: string;
  hint: string;
  max: number;
  multiline?: boolean;
  hidden?: boolean; // Fields managed by structured UI
}[] = [
  { name: 'fullName', label: 'Full name', hint: 'As it should appear on the CV', max: 200 },
  { name: 'headline', label: 'Headline', hint: 'One line under your name, e.g. Senior Full-Stack Engineer', max: 200 },
  { name: 'profile', label: 'Profile', hint: 'A short summary about you — your background and what you are looking for', max: 5000, multiline: true },
  { name: 'email', label: 'Email', hint: '', max: 300 },
  { name: 'phone', label: 'Phone', hint: '', max: 50 },
  { name: 'links', label: 'Links', hint: 'LinkedIn, GitHub… one per line', max: 2000, multiline: true },
  // Experience is now managed via structured entries (modal + cards)
  { name: 'experience', label: 'Experience', hint: 'Managed via structured entries below', max: 20000, multiline: true, hidden: true },
  { name: 'education', label: 'Education', hint: 'One entry per line, e.g. MSc, University (2015 - 2018)', max: 20000, multiline: true },
  { name: 'certificates', label: 'Certificates', hint: 'One certificate per line, e.g. AWS Certified Solutions Architect (2023)', max: 5000, multiline: true },
  { name: 'skills', label: 'Skills', hint: 'One group per line, e.g. Languages: Go, Python, TypeScript', max: 5000, multiline: true },
];

const EMPTY_FIELDS: Record<CvTemplateField, string> = {
  fullName: '',
  headline: '',
  profile: '',
  email: '',
  phone: '',
  links: '',
  experience: '',
  education: '',
  certificates: '',
  skills: '',
};

// The fields grouped the way a CV reads, so the form is not one flat wall
// of inputs. Grouping is presentational only: every field keeps the exact label
// and hint from FIELD_META (which the payload and tests rely on), and the order
// of FIELD_META still drives the build payload.
const FIELD_GROUPS: { title: string; fields: CvTemplateField[] }[] = [
  { title: 'About you', fields: ['fullName', 'headline', 'profile'] },
  { title: 'Contact', fields: ['email', 'phone', 'links'] },
  { title: 'Your background', fields: ['education', 'certificates', 'skills'] },
];

const FIELD_META_BY_NAME = Object.fromEntries(
  FIELD_META.map((meta) => [meta.name, meta]),
) as Record<CvTemplateField, (typeof FIELD_META)[number]>;

// The parser keeps an entry's text raw and reports the date range separately,
// so the text nearly always still contains the years. Appending the range
// unconditionally produced "Licence ... 2022 - 2025 ... (2025)", so only add it
// when the text has no year of its own.
function entriesToText(entries?: CvEntry[]): string {
  return (entries ?? [])
    .map((entry) => {
      const startYear = entry.dateRange?.split('-')[0]?.trim();
      if (!startYear || entry.text.includes(startYear)) return entry.text;
      return `${entry.text} (${entry.dateRange})`;
    })
    .join('\n');
}

// The parser's `dateRange` is a best-effort guess and can be nonsense: it once
// collapsed a whole multi-job block into "2025 - 2024". Copy it into the
// structured editor only when it reads as a real range — four-digit years, and a
// start that does not post-date the end. Anything else is dropped, so the card
// never shows a backwards range the user has to notice and fix. Months are left
// out on purpose: the parser rarely reports them reliably.
function parsePrefillDateRange(
  dateRange?: string,
): { startYear: string; endYear: string; current: boolean } {
  const empty = { startYear: '', endYear: '', current: false };
  if (!dateRange) return empty;
  const parts = dateRange
    .replace(/[–—]/g, '-')
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);
  const yearOf = (token: string): string => token.match(/(?:19|20)\d{2}/)?.[0] ?? '';
  const startYear = parts[0] ? yearOf(parts[0]) : '';
  if (!startYear) return empty;
  const endToken = (parts[1] ?? '').toLowerCase();
  const current = ['present', 'présent', 'actuel', 'current', 'now'].includes(endToken);
  const endYear = current ? '' : parts[1] ? yearOf(parts[1]) : '';
  if (endYear && Number(endYear) < Number(startYear)) return empty;
  return { startYear, endYear, current };
}

// The parser reports one chip per skill ("Docker", "Nginx"), but the templates
// print one row per line, so thirty chips became thirty rows of one word each.
// Chips are re-flowed into lines of at most ~90 characters: long enough to read
// as a sentence, short enough to stay scannable on the page.
function skillsToText(skills: string[]): string {
  const lines: string[] = [];
  for (const skill of skills) {
    const prev = lines[lines.length - 1];
    if (prev && prev.length + skill.length + 2 <= 90) {
      lines[lines.length - 1] = `${prev}, ${skill}`;
    } else {
      lines.push(skill);
    }
  }
  return lines.join('\n');
}

// Pre-fill order: the selected CV's parsed content wins, the profile fills the
// gaps, and the account supplies the contact details.
function buildPrefill(
  user: { name: string; email: string } | null,
  profile: Profile | null,
  cv: Cv | null,
): Record<CvTemplateField, string> {
  const data: CvStructuredData | null = cv?.structured_data ?? null;
  const skills = data?.skills?.length ? data.skills : (profile?.skills ?? []);
  return {
    fullName: data?.fullName ?? user?.name ?? '',
    email: data?.email ?? user?.email ?? '',
    phone: data?.phone ?? '',
    headline: profile?.headline ?? '',
    // The profile summary is authored on the dashboard profile, not parsed from
    // a CV, so it always comes from there. Certificates have no parsed source
    // yet — the field starts empty for the user to fill in.
    profile: profile?.bio ?? '',
    links: (data?.links ?? []).join('\n'),
    experience: entriesToText(data?.experience),
    education: entriesToText(data?.education),
    certificates: '',
    skills: skillsToText(skills),
  };
}

/**
 * Which form sections were filled by guesswork rather than by a section header
 * the parser actually recognised.
 *
 * A 'partial' parse means at least one header was not found, so the CV's
 * content silently flowed into whichever section came next — the common case
 * being languages ending up under Skills and real skills under Experience.
 * Rather than marking everything equally untrustworthy, name the sections that
 * actually look empty so the review is targeted.
 */
function uncertainSections(
  fields: Record<CvTemplateField, string>,
  status?: 'pending' | 'parsed' | 'partial' | 'failed' | null,
): Array<{ field: CvTemplateField; label: string }> {
  // 'parsed' found all three headers, so whatever is blank the user chose.
  if (status !== 'partial') return [];
  const candidates: Array<[CvTemplateField, string]> = [
    ['experience', 'Experience'],
    ['education', 'Education'],
    ['skills', 'Skills'],
  ];
  return candidates
    .filter(([field]) => !fields[field].trim())
    .map(([field, label]) => ({ field, label }));
}

// Not exported: a Next.js page file may only export the page itself (plus a
// fixed set of route-config fields), so the testable view stays module-local and
// is reached through the default export below (the guard is mocked in tests).
function CvBuilderView() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [template, setTemplate] = useState<CvTemplate | null>(null);
  const [sourceCvId, setSourceCvId] = useState('');
  const [fields, setFields] = useState<Record<CvTemplateField, string>>(EMPTY_FIELDS);
  const [build, setBuild] = useState<GeneratedCv | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const prefilled = useRef(false);
  const polls = useRef(0);

  // Structured experience entries (managed via modal), combined into fields.experience at build time.
  const [experienceEntries, setExperienceEntries] = useState<ExperienceEntry[]>([]);
  // The entry currently open in the modal (a blank one to add, or an existing
  // one to edit); null keeps the modal closed.
  const [entryModal, setEntryModal] = useState<ExperienceEntry | null>(null);

  const { data: templates = [], isLoading, isError, refetch } = useQuery<CvTemplate[]>({
    queryKey: ['cv-templates'],
    queryFn: () => apiJson('/api/cv-templates'),
  });
  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile'],
    queryFn: () => apiJson('/api/profile'),
  });
  // Same query key as /profile/cvs, so the cached list is reused.
  const { data: cvs = [] } = useQuery<Cv[]>({
    queryKey: ['cvs'],
    queryFn: () => apiJson('/api/cvs'),
  });

  // Every CV that carries parsed/structured content is a valid pre-fill source,
  // whether it was uploaded or generated here — reopening a CV you built earlier
  // should be able to seed the form. A CV with no structured_data has nothing to
  // copy, so it stays out (and the empty/profile-only states explain that).
  const sourceOptions = useMemo(
    () => cvs.filter((cv) => cv.structured_data),
    [cvs],
  );

  useEffect(() => {
    if (prefilled.current || !profile) return;
    const source = sourceOptions.find((cv) => cv.id === sourceCvId) ?? null;
    setFields(buildPrefill(user, profile, source));
    // Seed the structured Experience editor from the parsed CV. The rule/AI
    // parsers only ever produce a raw text block per entry (cvEntrySchema is
    // `text` + optional `dateRange`) — they never decompose role vs company — so
    // we must NOT invent them here. Guessing "Role, Company" off the first line
    // is what previously left most rows with an empty title ("Untitled entry")
    // and split a good description in half. Each parsed entry becomes one
    // editable row carrying the whole text in `description`; the card titles it
    // with the first line (see entryTitle). Dates are copied only when they read
    // as a real range, because dateRange is a best-effort guess.
    const parsed = source?.structured_data?.experience ?? [];
    setExperienceEntries(
      parsed.map((e, i) => {
        const dates = parsePrefillDateRange(e.dateRange);
        return {
          id: `exp-${i}`,
          company: '',
          role: '',
          startMonth: '',
          startYear: dates.startYear,
          endMonth: '',
          endYear: dates.endYear,
          current: dates.current,
          description: e.text,
        };
      }),
    );
    prefilled.current = true;
  }, [profile, sourceOptions, sourceCvId, user]);

  // Sync structured entries → fields.experience string whenever entries change.
  useEffect(() => {
    setFields(prev => ({ ...prev, experience: buildExperienceText(experienceEntries) }));
  }, [experienceEntries]);

  const tooLong = FIELD_META.find(
    ({ name, max }) => fields[name].length > max,
  );
  const sourceCv = cvs.find((cv) => cv.id === sourceCvId) ?? null;
  const unsure = uncertainSections(fields, sourceCv?.parse_status);
  const pending = build?.status === 'queued' || build?.status === 'compiling';
  const canSubmit =
    Boolean(template) &&
    !pending &&
    !tooLong &&
    fields.fullName.trim().length > 0;

  // Poll the build until it is ready or failed (the server compiles in the
  // background), then refresh the unified CV list.
  useEffect(() => {
    if (!build || build.status === 'ready' || build.status === 'failed') return;
    const id = build.id;
    const timer = setTimeout(async () => {
      polls.current += 1;
      try {
        const next = await apiJson<GeneratedCv>(`/api/cvs/build/${id}`);
        setBuild(next);
        if (next.status === 'ready') {
          queryClient.invalidateQueries({ queryKey: ['cvs'] });
        }
      } catch (error) {
        // A transient failure must not abandon the build: report it and let the
        // user retry from the status card.
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Could not read the build status',
        });
        setBuild(null);
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [build, queryClient]);

  // Safety net: a build that never settles must not poll forever.
  useEffect(() => {
    if (pending && polls.current >= MAX_POLLS) {
      setMessage({ type: 'error', text: 'This is taking too long — try again.' });
      setBuild(null);
    }
  }, [pending]);

  // One payload shape shared by the final build and the live preview, so the
  // preview always reflects exactly what [Generate PDF] would produce.
  const currentPayload = () => ({
    template_id: template?.id ?? '',
    fields: Object.fromEntries(
      FIELD_META.map(({ name }) => [name, fields[name].trim()]),
    ),
  });

  // --- Experience entry modal handlers --------------------------------------
  // The modal owns its draft and validation; these just open it and commit the
  // finished entry, so typing never touches the saved list mid-edit.
  function openAddEntry() {
    setEntryModal({ ...EMPTY_EXPERIENCE_ENTRY, id: crypto.randomUUID() });
  }

  function openEditEntry(entry: ExperienceEntry) {
    setEntryModal(entry);
  }

  function closeEntryModal() {
    setEntryModal(null);
  }

  function commitEntry(updated: ExperienceEntry) {
    setExperienceEntries((prev) =>
      prev.some((e) => e.id === updated.id)
        ? prev.map((e) => (e.id === updated.id ? updated : e))
        : [...prev, updated],
    );
    setEntryModal(null);
  }

  function deleteEntry(id: string) {
    setExperienceEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const buildMutation = useMutation({
    mutationFn: () => {
      if (!template) throw new Error('Pick a template first');
      return apiJson<GeneratedCv>('/api/cvs/build', {
        method: 'POST',
        body: JSON.stringify(currentPayload()),
      });
    },
    onSuccess: (row) => {
      polls.current = 0;
      setBuild(row);
      setMessage(null);
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  function applySource(cvId: string) {
    setSourceCvId(cvId);
    prefilled.current = false;
  }

  // One field renderer shared by every group, so the label, hint, length/date
  // nudges and multi-line behaviour stay identical no matter which section a
  // field sits in. Grouping is purely presentational.
  function renderField(meta: (typeof FIELD_META)[number]) {
    return (
      <Field
        key={meta.name}
        label={meta.label}
        hint={
          unsure.some((item) => item.field === meta.name)
            ? 'Parsed automatically — nothing was found here, please check or fill it in.'
            : meta.hint
        }
        error={
          tooLong?.name === meta.name
            ? `${meta.label} is too long (max ${meta.max} characters)`
            : (meta.name === 'experience' || meta.name === 'education')
              ? (() => {
                  const v = fields[meta.name];
                  if (!v.trim()) return undefined;
                  const lines = v.split(/\r?\n/).filter(Boolean);
                  if (lines.some((l) => !hasLikelyDateRange(l))) {
                    return 'Missing dates? Add e.g. (2021 - Present)';
                  }
                  return undefined;
                })()
              : undefined
        }
        className={meta.multiline ? 'sm:col-span-2' : undefined}
      >
        {(id) =>
          meta.multiline ? (
            <Textarea
              id={id}
              value={fields[meta.name]}
              maxLength={meta.max}
              onChange={(e) =>
                setFields({ ...fields, [meta.name]: e.target.value })
              }
              className="min-h-[110px] whitespace-pre-wrap"
            />
          ) : (
            <Input
              id={id}
              value={fields[meta.name]}
              maxLength={meta.max}
              onChange={(e) =>
                setFields({ ...fields, [meta.name]: e.target.value })
              }
            />
          )
        }
      </Field>
    );
  }

  if (isLoading) return <SectionLoader label="Loading templates..." />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Couldn't load the templates"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="CV Builder"
          subtitle="Pick a template, fill in your details and generate a PDF"
          actions={
            <Link
              href="/dashboard/profile/cvs"
              className="text-sm font-semibold text-accent hover:underline"
            >
              My CVs
            </Link>
          }
        />
        {message && (
          <Alert tone={message.type}>{message.text}</Alert>
        )}

        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates available"
            description="An admin has to activate a CV template before you can build one."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTemplate(item)}
                  className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.preview_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, cannot go through the Next image optimizer
                    <img
                      src={item.preview_image_url}
                      alt={`${item.name} preview`}
                      className="h-40 w-full bg-muted object-cover"
                      loading="lazy"
                    />
                  )}
                  <span className="flex-1 p-4">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.name}
                    </span>
                    {item.description && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Changing anything the preview depends on restarts the pane's debounce timer.
  const previewSignature = template ? JSON.stringify(currentPayload()) : '';

  return (
    <>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="CV Builder"
        subtitle="Check the live preview as you type, then generate the PDF"
      />

      {message && <Alert tone={message.type}>{message.text}</Alert>}

      {build && (
        <Card as="section">
          <CardContent className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
            {build.status === 'ready' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-foreground">
                  Your CV is ready and saved in My CVs.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    downloadApiFile(
                      build.pdf_url ?? `/api/cvs/build/${build.id}/file`,
                      `cv-${build.id}.pdf`,
                    ).catch((e: Error) =>
                      setMessage({ type: 'error', text: e.message }),
                    )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download PDF
                </Button>
              </>
            ) : build.status === 'failed' ? (
              <>
                <Alert tone="error" className="flex-1">
                  {build.error_message ?? 'Generation failed.'}
                </Alert>
                <Button type="button" variant="outline" size="sm" onClick={() => setBuild(null)}>
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Loader2
                  className="h-5 w-5 animate-spin text-accent"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                  {build.status === 'queued'
                    ? 'Queued — starting the compiler…'
                    : 'Compiling your PDF…'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            buildMutation.mutate();
          }}
        >
        {sourceOptions.length > 0 ? (
          <Card as="section">
            <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
              <CardTitle
                icon={<Wand2 className="h-4 w-4 text-muted-foreground" aria-hidden />}
              >
                Pre-fill from
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-5 sm:px-6">
              <Field
                label="Saved CV"
                hint="Copies its parsed content into the form. Everything stays editable."
              >
                {(id) => (
                  <Select
                    id={id}
                    value={sourceCvId}
                    onChange={(e) => applySource(e.target.value)}
                  >
                    <option value="">Profile and account details only</option>
                    {sourceOptions.map((cv) => {
                      // Several CVs can share a label (often the candidate's own
                      // name), so the created date is what makes each row unique.
                      const date = formatCvDate(cv.created_at);
                      return (
                        <option key={cv.id} value={cv.id}>
                          {cv.label}
                          {date ? ` · ${date}` : ''}
                          {cv.parse_status ? ` (${formatParseStatus(cv.parse_status)})` : ''}
                        </option>
                      );
                    })}
                  </Select>
                )}
              </Field>
            </CardContent>
          </Card>
        ) : cvs.length > 0 ? (
          <Card as="section">
            <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
              <CardTitle
                icon={<Wand2 className="h-4 w-4 text-muted-foreground" aria-hidden />}
              >
                Pre-fill from
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-5 sm:px-6">
              <p className="text-sm text-muted-foreground">
                No parsed CVs yet — upload one with extractable text or try AI parsing
                from “My CVs”.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card as="section">
            <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
              <CardTitle
                icon={<Wand2 className="h-4 w-4 text-muted-foreground" aria-hidden />}
              >
                Pre-fill from
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-5 sm:px-6">
              <p className="text-sm text-muted-foreground">
                No saved CVs yet — upload one or fill in the form below
              </p>
            </CardContent>
          </Card>
        )}

        <Card as="section">
          <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
            <CardTitle
              icon={<FileText className="h-4 w-4 text-muted-foreground" aria-hidden />}
            >
              Your details
            </CardTitle>
          </CardHeader>
          {/* A partial parse hides its uncertainty; name the sections it guessed
              at and point at the tool that fixes it. */}
          {unsure.length > 0 && (
            <div className="border-b border-border bg-warning/10 px-4 py-3 text-sm sm:px-6">
              <p className="text-foreground">
                {`Parsed automatically, but ${unsure
                  .map((item) => item.label)
                  .join(' and ')} came out empty — the section headers in that CV weren't recognised.`}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Link
                  href="/dashboard/profile/cvs"
                  className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Try AI parsing
                </Link>
                <span>or just fill the section in below.</span>
              </p>
            </div>
          )}
          <CardContent className="space-y-6 px-4 py-5 sm:px-6">
            {FIELD_GROUPS.map((group) => (
              <fieldset key={group.title}>
                <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.fields.map((name) => renderField(FIELD_META_BY_NAME[name]))}
                </div>
              </fieldset>
            ))}
          </CardContent>
        </Card>

        {/* Experience entries — structured rows that compile into the single
            {{experience}} template string. */}
        <Card as="section">
          <CardHeader className="border-b border-border px-4 py-4 sm:px-6 flex flex-row items-center justify-between">
            <CardTitle
              icon={<FileText className="h-4 w-4 text-muted-foreground" aria-hidden />}
            >
              Experience
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAddEntry()}
            >
              <Plus className="h-4 w-4 mr-1.5" aria-hidden />
              Add experience
            </Button>
          </CardHeader>
          <CardContent className="px-4 py-5 sm:px-6">
            {experienceEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No experience entries yet. Click “Add experience” to start.
              </p>
            ) : (
              <ul className="space-y-3">
                {experienceEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-border bg-muted/35 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium text-foreground truncate">
                        {entryTitle(entry)}
                      </p>
                      {formatDateRange(entry) && (
                        <p className="text-xs text-muted-foreground">{formatDateRange(entry)}</p>
                      )}
                      {entryBody(entry) && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{entryBody(entry)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Edit experience"
                        onClick={() => openEditEntry(entry)}
                      >
                        <Edit2 className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Delete experience"
                        onClick={() => deleteEntry(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={buildMutation.isPending}
            disabled={!canSubmit}
          >
            Generate PDF
          </Button>
          {/* A disabled button is not self-explanatory: always say what is
              holding it up. */}
          {pending ? (
            <p className="text-xs text-muted-foreground">
              One build at a time — this usually takes under a minute.
            </p>
          ) : tooLong ? (
            <p className="text-xs text-muted-foreground">
              {`Shorten ${tooLong.label} — it exceeds ${tooLong.max} characters.`}
            </p>
          ) : !fields.fullName.trim() ? (
            <p className="text-xs text-muted-foreground">
              Add a full name to generate your CV.
            </p>
          ) : null}
        </div>
        {/* Hidden field for experience (structured entries compile into this) */}
        <input
          type="hidden"
          id="experience"
          name="experience"
          data-testid="experience-field"
          value={fields.experience}
        />
        </form>

        {/* Live preview: debounced, aborted-on-change, ephemeral. The real PDF
            is still produced only by the explicit [Generate PDF] step above,
            which persists to generated_cvs. */}
        <div className="lg:sticky lg:top-6">
          <SplitPreviewPane
            signature={previewSignature}
            enabled={Boolean(template)}
            subtitle={`Template: ${template.name}`}
            headerAction={
              <button
                type="button"
                onClick={() => {
                  setTemplate(null);
                  setBuild(null);
                  setMessage(null);
                }}
                className="text-xs font-semibold text-accent hover:underline"
              >
                Change template
              </button>
            }
            idleLabel="Fill in your details to see a live preview."
            fetchPreview={(signal) =>
              apiJson<{ image: string | null }>('/api/cvs/build/preview', {
                method: 'POST',
                body: JSON.stringify(currentPayload()),
                signal,
              })
            }
          />
        </div>
      </div>
    </div>

    {entryModal && (
      <ExperienceEntryModal
        entry={entryModal}
        isNew={!experienceEntries.some((e) => e.id === entryModal.id)}
        onClose={closeEntryModal}
        onSave={commitEntry}
      />
    )}
    </>
  );
}

export default function CvBuilderPage() {
  return (
    <DashboardGuard>
      <CvBuilderView />
    </DashboardGuard>
  );
}