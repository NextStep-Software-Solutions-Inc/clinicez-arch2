import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, AdminLeadDto } from '@/services/admin.service';
import {
  IconUsersGroup,
  IconRefresh,
  IconMail,
  IconSearch,
  IconAlertCircle,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';
import { toast } from 'sonner';

function LeadsPage() {
  const [leads, setLeads] = useState<AdminLeadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getLeads();
      setLeads(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load prospective conversion leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.clinicName.toLowerCase().includes(q) ||
        l.tenantSlug.toLowerCase().includes(q) ||
        l.ownerName.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.facilityType.toLowerCase().includes(q)
    );
  }, [leads, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Conversion Leads Monitor</h1>
          <p className="text-xs text-text-muted mt-1">
            Prospect clinics, trialing organizations, and onboarding pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadLeads}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
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
            onClick={loadLeads}
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
            placeholder="Search prospective leads..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-text-muted font-medium">
          {filteredLeads.length} {filteredLeads.length === 1 ? 'prospect' : 'prospects'} in flight
        </div>
      </div>

      {/* 4-State Table Viewport */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-text-muted font-semibold">
              <tr>
                <th className="px-5 py-3.5">Organization</th>
                <th className="px-5 py-3.5">Contact Person</th>
                <th className="px-5 py-3.5">Facility Type</th>
                <th className="px-5 py-3.5">Trial Status</th>
                <th className="px-5 py-3.5 text-right">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                /* Skeleton State */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 w-36 bg-surface-muted rounded-md mb-1.5" />
                      <div className="h-3 w-20 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-28 bg-surface-muted rounded-md mb-1.5" />
                      <div className="h-3 w-32 bg-surface-muted rounded-md" />
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
              ) : filteredLeads.length === 0 ? (
                /* Empty State */
                <tr>
                  <td colSpan={5} className="py-12 text-center space-y-2">
                    <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
                      <IconUsersGroup className="h-6 w-6" />
                    </div>
                    <div className="font-semibold text-text">No Conversion Leads Recorded</div>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      {search
                        ? 'No prospective clinics match your search query. Try clearing the filter.'
                        : 'Zero prospective clinic onboarding leads are currently registered in the pipeline.'}
                    </p>
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="px-4 py-1.5 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        Reset Search
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                /* Active Table */
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-text">{lead.clinicName}</div>
                      <div className="text-[11px] text-text-muted font-mono font-normal mt-0.5">
                        {lead.tenantSlug}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-text font-medium">{lead.ownerName}</div>
                      <div className="text-[11px] text-text-muted flex items-center gap-1.5 mt-0.5">
                        <IconMail className="h-3.5 w-3.5 shrink-0" />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(lead.email);
                            toast.success(`Copied '${lead.email}' to clipboard`);
                          }}
                          className="hover:underline cursor-pointer flex items-center gap-1"
                          title="Click to Copy Email"
                        >
                          <span>{lead.email}</span>
                          <IconCopy className="h-3 w-3 text-text-muted" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      <span className="capitalize">{lead.facilityType || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        {lead.subscriptionStatus || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-text-muted font-mono text-[11px]">
                      {lead.createdAt
                        ? new Date(lead.createdAt).toLocaleDateString()
                        : '—'}
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
  path: 'leads',
  component: LeadsPage,
});
