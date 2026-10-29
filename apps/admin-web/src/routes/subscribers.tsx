import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, AdminNewsletterSubscriberDto } from '@/services/admin.service';
import {
  IconMail,
  IconDownload,
  IconRefresh,
  IconSearch,
  IconAlertCircle,
  IconCopy,
  IconCircleCheck,
} from '@tabler/icons-react';
import { toast } from 'sonner';

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<AdminNewsletterSubscriberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadSubscribers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getNewsletterSubscribers();
      setSubscribers(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load newsletter subscribers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscribers();
  }, []);

  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      toast.error('No subscribers to export.');
      return;
    }
    const header = 'Email,Source,Status,SubscribedAt\r\n';
    const rows = subscribers
      .map(
        (s) =>
          `${escapeCsvField(s.email)},${escapeCsvField(s.source)},${escapeCsvField(
            s.status
          )},${escapeCsvField(s.subscribedAt)}`
      )
      .join('\r\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `subscribers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Subscriber CSV exported per RFC-4180 format.');
  };

  const filteredSubscribers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q)
    );
  }, [subscribers, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Subscribers Directory</h1>
          <p className="text-xs text-text-muted mt-1">
            Newsletter subscribers, marketing audience, and outreach engagement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadSubscribers}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={subscribers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            <IconDownload className="h-4 w-4" />
            <span>Export RFC-4180 CSV</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadSubscribers}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subscribers by email or source..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-text-muted font-medium">
          {filteredSubscribers.length} {filteredSubscribers.length === 1 ? 'subscriber' : 'subscribers'}
        </div>
      </div>

      {/* 4-State Table Viewport */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-text-muted font-semibold">
              <tr>
                <th className="px-5 py-3.5">Subscriber Email</th>
                <th className="px-5 py-3.5">Acquisition Source</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Subscribed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                /* Skeleton State */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 w-40 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-24 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-16 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="h-4 w-20 bg-surface-muted rounded-md ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredSubscribers.length === 0 ? (
                /* Contextual Empty State */
                <tr>
                  <td colSpan={4} className="py-12 text-center space-y-2">
                    <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
                      <IconMail className="h-6 w-6" />
                    </div>
                    <div className="font-semibold text-text">No Subscribers Found</div>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      {search
                        ? 'No subscribers match your search query. Try clearing the search term.'
                        : 'No subscribers have opted in to platform marketing newsletters yet.'}
                    </p>
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="px-4 py-1.5 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        Clear Search
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                /* Active Table */
                filteredSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-text font-mono flex items-center gap-2">
                        <span>{sub.email}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(sub.email);
                            toast.success(`Copied '${sub.email}' to clipboard`);
                          }}
                          className="text-text-muted hover:text-text cursor-pointer"
                          title="Copy Email"
                        >
                          <IconCopy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      <span className="capitalize">{sub.source || 'Website Footer'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {sub.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-text-muted font-mono text-[11px]">
                      {sub.subscribedAt
                        ? new Date(sub.subscribedAt).toLocaleDateString()
                        : 'Recent'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'subscribers',
  component: SubscribersPage,
});
