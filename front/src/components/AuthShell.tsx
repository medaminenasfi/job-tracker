import Image from 'next/image';
import logoImg from '@/assest/Logo_minimaliste_AT_avec_swoosh-removebg-preview.png';

// Single shell for the four auth surfaces (login, register, forgot-password,
// reset-password) so the brand header, card chrome, and ambient backdrop live in
// exactly one place (AGENTS.md §4: never duplicate).
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Ambient glow + faint grid behind the card */}
      <div className="ambient-grid pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card animate-pop-in sm:p-8">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background p-1.5 shadow-sm ring-1 ring-border">
            <Image
              src={logoImg}
              alt="Job Tracker Logo"
              width={40}
              height={40}
              priority
              className="h-9 w-9 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
