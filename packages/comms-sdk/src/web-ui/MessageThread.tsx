import React, { useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { ThreadMessage, WebMessageThreadProps } from './types';
import { OverlayTooltip } from './OverlayTooltip';
import { LoaderIcon, CheckIcon, CheckCheckIcon, AlertCircleIcon, LockIcon } from './icons';

export const MessageThread: React.FC<WebMessageThreadProps> = ({
  conversationId,
  conversationTitle,
  conversationScope,
  messages,
  currentUserId,
  onSendMessage,
  onResendMessage,
  onAcknowledgeMessage,
  onFileToChart,
  privacyBlurEnabled,
  onTogglePrivacyBlur,
  renderPrivacyIcon,
  showHeader = true,
  canWriteInternalNotes = false,
  isLoading = false,
  error = null,
  isArchived = false,
  archivedBannerText,
  isReadOnly = false,
  readOnlyBanner,
  className = ''
}) => {
  const [inputText, setInputText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const effectiveReadOnly = Boolean(isReadOnly || isArchived);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly || !inputText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSendMessage(inputText.trim(), isInternal);
      setInputText('');
      setIsInternal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDeliveryState = (msg: ThreadMessage) => {
    switch (msg.state) {
      case 'Sending':
        return (
          <span className="flex items-center gap-1 text-xs text-white/80" title="Sending to comms hub...">
            <LoaderIcon size={12} className="animate-spin" />
            <span>Sending...</span>
          </span>
        );
      case 'Waiting':
        return (
          <span className="flex items-center gap-1 text-xs text-white/80" title="Delivered to hub, awaiting recipient storage confirmation">
            <CheckIcon size={12} />
            <span>Sent, waiting</span>
          </span>
        );
      case 'Received':
        return (
          <span className="flex items-center gap-1 text-xs text-white font-semibold" title="Recipient device confirmed storage">
            <CheckCheckIcon size={12} />
            <span>Delivered</span>
          </span>
        );
      case 'NotReceived':
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-200 font-bold" title="Retention deadline expired without receipt confirmation">
            <AlertCircleIcon size={12} className="text-red-300" />
            <span>Not delivered</span>
            <button
              type="button"
              onClick={() => onResendMessage(msg.id)}
              className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-white text-red-700 hover:bg-red-50 transition-colors"
            >
              Resend
            </button>
          </span>
        );
    }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <h1 className="text-xs font-semibold truncate">
              {!conversationTitle || conversationTitle.toLowerCase() === 'conversation'
                ? (conversationScope === 'PatientFacility'
                    ? 'Patient Request'
                    : conversationScope === 'StaffContext' || conversationScope === 'PatientContext'
                      ? 'Care Team'
                      : conversationScope === 'Direct'
                        ? 'Direct Message'
                        : conversationScope === 'Facility'
                          ? 'Facility Channel'
                          : conversationScope || 'Facility Channel')
                : conversationTitle}
            </h1>
            <p className="text-[11px] text-slate-500 leading-tight">
              {conversationScope === 'PatientFacility'
                ? 'Patient Request'
                : conversationScope === 'StaffContext' || conversationScope === 'PatientContext'
                  ? 'Care Team'
                  : conversationScope === 'Direct'
                    ? 'Direct Message'
                    : conversationScope === 'Facility'
                      ? 'Facility Channel'
                      : conversationScope}
            </p>
          </div>

          <OverlayTooltip
            label={privacyBlurEnabled ? 'Disable privacy blur' : 'Enable privacy blur'}
            placement="bottom"
          >
            <button
              type="button"
              data-testid="btn-toggle-privacy-blur"
              onClick={onTogglePrivacyBlur}
              className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${
                privacyBlurEnabled
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
              aria-label={privacyBlurEnabled ? 'Disable patient privacy blur' : 'Enable patient privacy blur'}
            >
              {renderPrivacyIcon ? (
                renderPrivacyIcon(privacyBlurEnabled)
              ) : privacyBlurEnabled ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                  <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                  <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                  <path d="m2 2 20 20" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </OverlayTooltip>
        </div>
      )}

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <LoaderIcon size={32} className="animate-spin mb-2" />
          <p className="text-sm">Loading message thread...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <AlertCircleIcon size={32} className="mb-2 text-red-600" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Error Loading Thread</p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
          <LockIcon size={32} className="mb-2 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Secure Communication
          </p>
          <p className="text-xs text-slate-400 max-w-sm">
            This is the start of your medical communication thread. Messages are encrypted in transit.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isMe = Boolean(msg.senderId && msg.senderId === currentUserId);
            const isInternalNote = msg.visibility === 'Internal';
            const isPeeking = hoveredMessageId === msg.id;
            const isObscured = privacyBlurEnabled && !isPeeking;

            if (isInternalNote) {
              return (
                <div
                  key={msg.id}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                  className={`w-full p-3.5 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 transition-all ${
                    isPeeking ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold mb-1 text-amber-800 dark:text-amber-300">
                    <LockIcon size={12} />
                    <span>Private Staff Note (Care Team Only)</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${isObscured ? 'blur-sm select-none' : ''}`}>
                    {msg.contentText}
                  </p>
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    {msg.senderDisplayName} •{' '}
                    {new Date(msg.clientSentAtUtc).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                className={`flex flex-col max-w-[75%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                {!isMe && (
                  <span className="text-xs text-slate-500 mb-1 ml-1">{msg.senderDisplayName}</span>
                )}

                <div
                  className={`p-3.5 rounded-lg shadow-sm transition-all ${
                    isMe
                      ? 'bg-teal-700 text-white rounded-br-none'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                  } ${isPeeking ? 'ring-2 ring-teal-700' : ''}`}
                >
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isObscured ? 'blur-sm select-none' : ''}`}>
                    {msg.contentText}
                  </p>

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1.5 pt-2 border-t border-black/10 dark:border-white/10">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.fileKey}
                          className={`flex items-center justify-between p-2 rounded bg-black/10 dark:bg-white/10 text-xs ${
                            isObscured ? 'blur-sm select-none' : ''
                          }`}
                        >
                          <span className={`truncate max-w-[180px] ${isObscured ? 'blur-sm select-none' : ''}`}>
                            File: {att.fileName}
                          </span>
                          {onFileToChart && isMe && (
                            <button
                              type="button"
                              onClick={() => onFileToChart(msg.id, att.fileKey)}
                              className="ml-2 px-2 py-0.5 rounded bg-white text-slate-900 font-semibold hover:bg-slate-100"
                            >
                              File to Chart
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acknowledgement Action */}
                  {msg.requiresAcknowledgement && (
                    <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-xs">
                      {msg.isAcknowledged ? (
                        <span className="text-emerald-300 font-medium">
                          Understood by {msg.acknowledgedByName ?? 'recipient'}
                        </span>
                      ) : onAcknowledgeMessage && !isMe ? (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeMessage(msg.id)}
                          className="min-h-[44px] px-3 py-1.5 rounded font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        >
                          Mark as Understood
                        </button>
                      ) : (
                        <span className="opacity-75">Awaiting acknowledgement</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 mt-2 pt-1 border-t border-black/5 dark:border-white/5">
                    <span className={`text-xs ${isMe ? 'text-white/80' : 'text-slate-400'}`}>
                      {new Date(msg.clientSentAtUtc).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {isMe && renderDeliveryState(msg)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input Bar or Archived Read-Only Banner */}
      {effectiveReadOnly ? (
        readOnlyBanner !== undefined && readOnlyBanner !== null ? (
          typeof readOnlyBanner === 'string' || typeof readOnlyBanner === 'number' ? (
            <div
              data-testid="message-thread-archived-banner"
              role="status"
              className="px-4 py-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
            >
              {readOnlyBanner}
            </div>
          ) : (
            readOnlyBanner
          )
        ) : (
          <div
            data-testid="message-thread-archived-banner"
            role="status"
            className="px-4 py-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
          >
            {archivedBannerText ?? 'This conversation is closed and archived. Message history is read-only.'}
          </div>
        )
      ) : (
        <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          {canWriteInternalNotes && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setIsInternal((prev) => !prev)}
                className={`min-h-[44px] px-3 rounded text-xs font-semibold transition-colors ${
                  isInternal
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {isInternal ? 'Internal Note Mode: ACTIVE' : 'Internal Note'}
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isInternal ? 'Type internal note for care team...' : 'Type message...'}
              rows={2}
              className={`flex-1 p-2.5 rounded border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-700 ${
                isInternal
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
              }`}
              aria-label="Message text input"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isSubmitting}
              className="min-h-[44px] px-5 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
