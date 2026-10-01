'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-lg shadow-card-hover text-sm font-medium text-white animate-toast-in ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      <span aria-hidden>{type === 'success' ? '✓' : '!'}</span>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  return { toast, showToast, hideToast };
}
