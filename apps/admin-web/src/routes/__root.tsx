import React, { useEffect, useState } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { IdleSessionGuard } from '@/components/IdleSessionGuard';
import { Toaster } from 'sonner';

function RootComponent() {
  const [theme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin-theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('admin-theme', theme);
  }, [theme]);

  return (
    <IdleSessionGuard>
      <Outlet />
      <Toaster position="top-right" richColors theme={theme} />
    </IdleSessionGuard>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
