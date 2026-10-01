import Image from 'next/image';
import logo from '@/assest/Logo_minimaliste_AT_avec_swoosh-removebg-preview.png';

type LoadingSize = 'sm' | 'md' | 'lg';

const spinnerSizes: Record<LoadingSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
};

export function LoadingSpinner({ size = 'md' }: { size?: LoadingSize }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent ${spinnerSizes[size]}`}
    />
  );
}

export function ButtonLoader({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <LoadingSpinner size="sm" />
      <span>{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading ApplyTracker...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="relative h-12 w-12">
          <Image src={logo} alt="ApplyTracker" fill sizes="48px" className="object-contain dark:invert" priority />
        </span>
        <LoadingSpinner size="md" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

export function SectionLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-card p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoadingSpinner size="sm" />
        <span>{label}</span>
      </div>
    </div>
  );
}