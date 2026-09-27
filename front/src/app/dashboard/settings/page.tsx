'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const res = await apiFetch('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], data);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
   (updateProfileMutation.mutate(formData));
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Parameters</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your personal data</p>
      </div>

      <div className="max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Personal Information</h2>
          
          {message && (
            <div
              className={`mb-4 p-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                placeholder="your@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-bold text-black mb-4">Account Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">User ID:</span>
              <span className="text-black font-mono">{user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span className="text-black">{user?.email}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
