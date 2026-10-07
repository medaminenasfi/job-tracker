'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, User, FileText } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { SectionLoader } from '@/components/ui/Loading';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ErrorState } from '@/components/ui/EmptyState';
import type { Profile } from '@/lib/types';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ headline: '', yearsExperience: '', bio: '' });
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<Profile>({
    queryKey: ['profile'],
    queryFn: () => apiJson('/api/profile'),
  });

  useEffect(() => {
    if (data) {
      setForm({
        headline: data.headline ?? '',
        yearsExperience: data.yearsExperience != null ? String(data.yearsExperience) : '',
        bio: data.bio ?? '',
      });
      setSkills(data.skills ?? []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiJson('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          headline: form.headline || null,
          yearsExperience: form.yearsExperience === '' ? null : Number(form.yearsExperience),
          skills,
          bio: form.bio || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setMessage({ type: 'success', text: 'Profile saved.' });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) setSkills([...skills, s]);
    setSkillInput('');
  };

  if (isLoading) return <SectionLoader label="Loading your profile..." />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Couldn't load your profile"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const empty = !data?.headline && skills.length === 0 && !data?.bio;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile" subtitle="Powers your AI job match scores" />

      <Link
        href="/dashboard/profile/cvs"
        className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Manage CVs (upload &amp; attach to applications)
      </Link>

      {empty && (
        <Alert tone="warning">
          Fill in your profile to get accurate AI match scores.
        </Alert>
      )}

      {message && (
        <Alert tone={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Card as="section">
          <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
            <CardTitle icon={<User className="h-4 w-4 text-muted-foreground" aria-hidden />}>
              About you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-4 py-5 sm:px-6">
            <Field label="Headline">
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  value={form.headline}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder="e.g. Full-Stack Developer"
                />
              )}
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Years of experience">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={70}
                    value={form.yearsExperience}
                    onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
                    placeholder="e.g. 4"
                  />
                )}
              </Field>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Skills
                </span>
                <div className="flex gap-2">
                  <Input
                    aria-label="Add a skill"
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="Type a skill and press Enter"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addSkill}
                    aria-label="Add skill"
                    className="h-10 w-10 shrink-0"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm text-foreground"
                >
                  {s}
                  <button
                    type="button"
                    aria-label={`Remove ${s}`}
                    onClick={() => setSkills(skills.filter((x) => x !== s))}
                    className="text-muted-foreground transition-colors hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              {skills.length === 0 && (
                <span className="text-sm text-muted-foreground">No skills added yet.</span>
              )}
            </div>

            <Field label="Bio" hint={`${form.bio.length}/2000`}>
              {(id) => (
                <Textarea
                  id={id}
                  value={form.bio}
                  maxLength={2000}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={4}
                  placeholder="Short summary about you"
                  className="resize-y"
                />
              )}
            </Field>

            <Button type="submit" loading={saveMutation.isPending} className="px-6">
              {saveMutation.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
