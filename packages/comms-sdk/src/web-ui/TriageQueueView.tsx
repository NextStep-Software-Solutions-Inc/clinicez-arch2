import React, { useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import {
  TriageDispositionPayload,
  TriageQueueItem,
  WebTriageQueueViewProps
} from './types';

function formatSlaCountdown(item: TriageQueueItem): string {
  if (item.slaBreached) {
    return '⚠️ SLA Breached';
  }

  let remainingSec: number | null = null;
  if (typeof item.slaTimeRemainingSeconds === 'number') {
    remainingSec = item.slaTimeRemainingSeconds;
  } else if (item.triageDueAtUtc) {
    const dueTime = new Date(item.triageDueAtUtc).getTime();
    if (!isNaN(dueTime)) {
      remainingSec = Math.floor((dueTime - Date.now()) / 1000);
    }
  }

  if (remainingSec === null) {
    return '⏳ Target: Queued';
  }

  if (remainingSec <= 0) {
    return '⚠️ SLA Breached';
  }

  if (remainingSec < 60) {
    return '⏳ Target: < 1m remaining';
  }

  const totalMinutes = Math.floor(remainingSec / 60);
  if (totalMinutes < 60) {
    return `⏳ Target: ${totalMinutes}m remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `⏳ Target: ${hours}h ${minutes}m remaining`
    : `⏳ Target: ${hours}h remaining`;
}

const DECLINE_REASONS = [
  { code: 'DUPLICATE', label: 'Duplicate Request' },
  { code: 'OUT_OF_SCOPE', label: 'Out of Clinic Scope' },
  { code: 'EMERGENCY_REFERRED', label: 'Referred to Emergency Dept' },
  { code: 'UNREACHABLE', label: 'Patient Unreachable' },
  { code: 'PATIENT_CANCELLED', label: 'Patient Cancelled' },
  { code: 'OTHER', label: 'Other Administrative Reason' }
] as const;

export const TriageQueueView: React.FC<WebTriageQueueViewProps> = ({
  items,
  facilityName,
  onExecuteDisposition,
  onRefresh,
  isLoading = false,
  error = null,
  activeFilter = 'All',
  onFilterChange,
  className = ''
}) => {
  const [selectedItem, setSelectedItem] = useState<TriageQueueItem | null>(null);
  const [modalMode, setModalMode] = useState<'Answer' | 'Decline' | 'Route' | null>(null);
  const [replyText, setReplyText] = useState('');
  const [declineReason, setDeclineReason] = useState<TriageDispositionPayload['declineReasonCode']>('OUT_OF_SCOPE');
  const [declineNotes, setDeclineNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenAction = (item: TriageQueueItem, mode: 'Answer' | 'Decline' | 'Route') => {
    setSelectedItem(item);
    setModalMode(mode);
    setReplyText('');
    setDeclineNotes('');
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedItem(null);
  };

  const handleSubmitDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !modalMode || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (modalMode === 'Answer') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Answered',
          replyText
        });
      } else if (modalMode === 'Decline') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Declined',
          declineReasonCode: declineReason,
          declineNotes
        });
      } else if (modalMode === 'Route') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Routed',
          routedPriority: selectedItem.priority === 'Emergency' ? 'Urgent' : 'Routine'
        });
      }
      handleCloseModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle1ClickNeedsVisit = async (item: TriageQueueItem) => {
    await onExecuteDisposition({
      conversationId: item.conversationId,
      disposition: 'NeedsVisit',
      replyText: 'Clinical evaluation required in person at the facility.'
    });
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.priority === activeFilter;
  });

  return (
    <div className={`flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold">Triage Workstation</h1>
            <p className="text-xs text-slate-500">{facilityName}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-[44px] px-3.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Filter Pills */}
        {onFilterChange && (
          <div className="flex gap-1.5" role="tablist">
            {(['All', 'Emergency', 'Urgent', 'Routine'] as const).map((filter) => {
              const isSelected = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onFilterChange(filter)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {filter === 'Emergency' ? '🚨 STAT' : filter === 'Urgent' ? '⚡ Urgent' : filter}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <div className="animate-spin text-3xl mb-2">⏳</div>
          <p className="text-sm">Loading triage queue...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
            Error Loading Triage
          </p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Triage Queue Clear
          </p>
          <p className="text-xs text-slate-400 max-w-sm">
            No patient inquiries require triage disposition at this time.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredItems.map((item) => {
            const isStat = item.priority === 'Emergency';
            const isUrgent = item.priority === 'Urgent';

            return (
              <div
                key={item.conversationId}
                className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    {isStat ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border border-red-300">
                        🚨 STAT
                      </span>
                    ) : isUrgent ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 border border-orange-300">
                        ⚡ Urgent
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border border-teal-300">
                        ✓ Routine
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.category}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      item.slaBreached || (typeof item.slaTimeRemainingSeconds === 'number' && item.slaTimeRemainingSeconds <= 0)
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border border-red-300'
                        : item.triageDueAtUtc || item.slaTimeRemainingSeconds !== undefined
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {formatSlaCountdown(item)}
                  </span>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {item.patientNameMasked || 'Patient Inquiry'}
                  </span>
                  {item.isEmergencyConfirmed && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300">
                      ✓ Non-Emergency Confirmed
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  {item.contentText}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAction(item, 'Answer')}
                    className="min-h-[44px] px-3.5 rounded text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                  >
                    💬 Answer
                  </button>

                  <button
                    type="button"
                    onClick={() => handle1ClickNeedsVisit(item)}
                    className="min-h-[44px] px-3.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    🏥 Needs Visit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAction(item, 'Route')}
                    className="min-h-[44px] px-3.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    ↪ Route
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAction(item, 'Decline')}
                    className="min-h-[44px] px-3.5 rounded text-xs font-semibold bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 transition-colors"
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Dialog */}
      {modalMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <form
            onSubmit={handleSubmitDisposition}
            className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              {modalMode === 'Answer'
                ? 'Answer Patient Inquiry'
                : modalMode === 'Decline'
                  ? 'Decline Inquiry (Mandatory Reason)'
                  : 'Route Inquiry to Care Team'}
            </h2>

            {modalMode === 'Answer' && (
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type public clinical response..."
                rows={4}
                className="w-full p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-700 mb-4"
                required
              />
            )}

            {modalMode === 'Decline' && (
              <div className="space-y-3 mb-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Reason Code:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DECLINE_REASONS.map((r) => {
                    const isSelected = declineReason === r.code;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setDeclineReason(r.code)}
                        className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-300'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={declineNotes}
                  onChange={(e) => setDeclineNotes(e.target.value)}
                  placeholder="Optional internal decline notes..."
                  rows={2}
                  className="w-full p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}

            {modalMode === 'Route' && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                This inquiry will be assigned to the facility care team queue with priority.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] px-4 rounded text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Disposition'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
