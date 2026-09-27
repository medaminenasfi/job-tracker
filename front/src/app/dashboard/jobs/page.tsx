'use client';

import { KanbanBoard } from '@/components/KanbanBoard';

export default function JobsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Job Track</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your job applications</p>
      </div>
      <KanbanBoard />
    </div>
  );
}
