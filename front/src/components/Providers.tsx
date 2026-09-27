'use client';

import { QueryClient, QueryClientProvider as QCProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QCProvider client={queryClient}>{children}</QCProvider>;
}
