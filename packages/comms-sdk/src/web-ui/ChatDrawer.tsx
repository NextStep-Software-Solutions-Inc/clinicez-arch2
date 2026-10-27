import React from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { ConversationScopeFilter, WebChatDrawerProps } from './types';

const SCOPES: ConversationScopeFilter[] = [
  'All',
  'PatientFacility',
  'StaffContext',
  'Facility',
  'Direct'
];

export const ChatDrawer: React.FC<WebChatDrawerProps> = ({
  isOpen,
  onClose,
  items,
  activeConversationId,
  onSelectConversation,
  selectedScope,
  onSelectScope,
  searchQuery,
  onSearchChange,
  onNewConversation,
  connectionState = 'Connected',
  loading = false,
  error = null,
  className = ''
}) => {
  if (!isOpen) return null;

  return (
    <aside
      className={`flex flex-col h-full w-full max-w-[380px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 ${className}`}
      aria-label="Communications Workstation"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Communications</h2>
          <div className="flex items-center gap-1.5">
            {onNewConversation && (
              <button
                type="button"
                onClick={onNewConversation}
                className="min-h-[44px] px-3 text-xs font-semibold rounded bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                aria-label="Start new conversation"
              >
                + New
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Offline / Reconnecting Banner */}
        {connectionState !== 'Connected' && (
          <div
            className={`p-2 mb-2 rounded text-xs flex items-center gap-1.5 ${
              connectionState === 'Reconnecting'
                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300'
                : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300'
            }`}
            role="status"
          >
            <span>{connectionState === 'Reconnecting' ? '...' : '!'}</span>
            <span>
              {connectionState === 'Reconnecting'
                ? 'Reconnecting to comms hub...'
                : 'Disconnected from comms'}
            </span>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <span className="absolute left-3 top-3 text-sm text-slate-400">Search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations..."
            className="w-full min-h-[44px] pl-9 pr-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
            aria-label="Search conversations"
          />
        </div>

        {/* Scope Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
          {SCOPES.map((scope) => {
            const isSelected = selectedScope === scope;
            return (
              <button
                key={scope}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectScope(scope)}
                className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-teal-700 text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {scope === 'PatientFacility'
                  ? 'Triage'
                  : scope === 'StaffContext'
                    ? 'Care Team'
                    : scope}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content States */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400" role="status">
          <div className="animate-spin text-2xl mb-2">...</div>
          <p className="text-sm">Loading conversations...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" role="alert">
          <div className="text-3xl mb-2">!</div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
            Error Loading Conversations
          </p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
          <div className="text-3xl mb-2">Chat</div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            No Conversations
          </p>
          <p className="text-xs text-slate-400 mb-4">No communication threads match this view.</p>
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="min-h-[44px] px-4 rounded bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800"
            >
              Start Conversation
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800" role="list">
          {items.map((item) => {
            const isActive = item.id === activeConversationId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectConversation(item.id)}
                className={`w-full text-left p-3.5 min-h-[44px] transition-colors ${
                  isActive
                    ? 'bg-teal-50 dark:bg-teal-950/40 border-l-4 border-teal-700'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
                role="listitem"
                aria-current={isActive ? 'true' : undefined}
              >
                <div className="flex justify-between items-baseline mb-1">
                  <span
                    className={`text-sm font-semibold truncate ${
                      isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.lastMessageAtUtc && (
                    <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                      {new Date(item.lastMessageAtUtc).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                </div>

                {item.lastMessageSnippet && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1.5">
                    {item.lastMessageSnippet}
                  </p>
                )}

                <div className="flex items-center gap-1.5">
                  {item.isEmergency && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border border-red-200 dark:border-red-800">
                      STAT
                    </span>
                  )}
                  {item.urgentCount !== undefined && item.urgentCount > 0 && !item.isEmergency && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
                      Urgent
                    </span>
                  )}
                  {item.unreadCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-700 text-white">
                      {item.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};
