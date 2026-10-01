import { AdminGuard } from '@/components/AdminGuard';

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
