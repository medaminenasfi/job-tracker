'use client';

import { useState, useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, apiJson } from '@/lib/api';
import { Job, JobNote, JobStatus } from '@/lib/types';

interface JobDetailsModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobDetailsModal({ job, isOpen, onClose }: JobDetailsModalProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<JobStatus>(job?.status || 'SAVED');
  const [noteMsg, setNoteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Multiple-notes manager state. `newNote` backs the add box; `editingId` /
  // `editBody` back inline editing of one existing note at a time.
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const jobId = job?.id;

  // The modal stays mounted while `job` swaps between cards, so re-sync the local
  // editors whenever a different job is opened. Without this, opening job B showed
  // job A's note/status and saving would overwrite the wrong record.
  useEffect(() => {
    setStatus(job?.status || 'SAVED');
    setNoteMsg(null);
    setNewNote('');
    setEditingId(null);
    setEditBody('');
  }, [job?.id, job?.status]);

  const notesQuery = useQuery({
    queryKey: ['jobNotes', jobId],
    queryFn: () => apiJson<JobNote[]>(`/api/jobs/${jobId}/notes`),
    enabled: !!jobId,
  });

  const invalidateNotes = () =>
    queryClient.invalidateQueries({ queryKey: ['jobNotes', jobId] });

  const updateJobMutation = useMutation({
    mutationFn: async (data: { status?: JobStatus }) => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update job');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete job');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onClose();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: (body: string) =>
      apiJson<JobNote>(`/api/jobs/${jobId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setNewNote('');
      setNoteMsg({ type: 'success', text: 'Note added' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to add note' }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      apiJson<JobNote>(`/api/jobs/${jobId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditBody('');
      setNoteMsg({ type: 'success', text: 'Note updated' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to update note' }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      apiFetch(`/api/jobs/${jobId}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      if (!res.ok) {
        setNoteMsg({ type: 'error', text: 'Failed to delete note' });
        return;
      }
      if (editingId) setEditingId(null);
      setNoteMsg({ type: 'success', text: 'Note deleted' });
      invalidateNotes();
    },
    onError: () => setNoteMsg({ type: 'error', text: 'Failed to delete note' }),
  });

  const busy =
    createNoteMutation.isPending ||
    updateNoteMutation.isPending ||
    deleteNoteMutation.isPending;

  const handleAddNote = () => {
    const body = newNote.trim();
    if (!body) return;
    setNoteMsg(null);
    createNoteMutation.mutate(body);
  };

  const handleSaveEdit = (noteId: string) => {
    const body = editBody.trim();
    if (!body) return;
    setNoteMsg(null);
    updateNoteMutation.mutate({ noteId, body });
  };

  const handleStatusChange = (newStatus: JobStatus) => {
    setStatus(newStatus);
    updateJobMutation.mutate({ status: newStatus });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this job?')) {
      deleteJobMutation.mutate();
    }
  };

  if (!isOpen || !job) return null;

  const notes = notesQuery.data ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-black">{job.title}</h2>
            <p className="text-gray-600">{job.company}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Location</label>
              <p className="text-black">{job.location || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Salary</label>
              <p className="text-black">{job.salary || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Source</label>
              <p className="text-black">{job.source || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Employment Type</label>
              <p className="text-black">{job.employment_type || 'N/A'}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
            >
              <option value="SAVED">Saved</option>
              <option value="APPLIED">Applied</option>
              <option value="SCREENING">Screening</option>
              <option value="INTERVIEW">Interview</option>
              <option value="OFFER">Offer</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>

          {job.description && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-black max-h-48 overflow-y-auto">
                {job.description}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>

            {/* Existing notes — each independently editable/deletable. */}
            <div className="space-y-2 mb-3">
              {notesQuery.isLoading && (
                <p className="text-sm text-gray-500">Loading notes...</p>
              )}
              {notesQuery.isError && (
                <p className="text-sm text-red-600">Failed to load notes.</p>
              )}
              {!notesQuery.isLoading && notes.length === 0 && (
                <p className="text-sm text-gray-400">No notes yet.</p>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                >
                  {editingId === note.id ? (
                    <div>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:border-black"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={busy || editBody.trim() === ''}
                          className="px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm"
                        >
                          {updateNoteMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditBody('');
                          }}
                          disabled={busy}
                          className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-sm text-black whitespace-pre-wrap break-words flex-1">
                        {note.body}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingId(note.id);
                            setEditBody(note.body);
                          }}
                          disabled={busy}
                          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          disabled={busy}
                          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add a new note. */}
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              rows={3}
              placeholder="Add a note..."
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleAddNote}
                disabled={busy || newNote.trim() === ''}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm"
              >
                {createNoteMutation.isPending ? 'Adding...' : 'Add Note'}
              </button>
            </div>
            {noteMsg && (
              <p
                role="status"
                className={`mt-2 text-sm ${noteMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {noteMsg.text}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Open Original Job
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteJobMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
            >
              {deleteJobMutation.isPending ? 'Deleting...' : 'Delete Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
