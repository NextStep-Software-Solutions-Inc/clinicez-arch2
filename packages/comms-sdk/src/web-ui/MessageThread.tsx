import React, { useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { ThreadMessage, WebMessageThreadProps } from './types';

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
  canWriteInternalNotes = false,
  isLoading = false,
  error = null,
  className = ''
}) => {
  const [inputText, setInputText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSubmitting) return;

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
          <span className="flex items-center gap-1 text-[11px] text-white/80" title="Sending to comms hub...">
            <span>...</span>
            <span>Sending...</span>
          </span>
        );
      case 'Waiting':
        return (
          <span className="flex items-center gap-1 text-[11px] text-white/80" title="Delivered to hub, awaiting recipient storage ACK">
            <span>OK</span>
            <span>Sent, waiting</span>
          </span>
        );
      case 'Received':
        return (
          <span className="flex items-center gap-1 text-[11px] text-white font-semibold" title="Recipient device confirmed storage">
            <span>ACK</span>
            <span>Delivered</span>
          </span>
        );
      case 'NotReceived':
        return (
          <span className="flex items-center gap-1.5 text-[11px] text-red-200 font-bold" title="Retention deadline expired without receipt confirmation">
            <span>!</span>
            <span>Not delivered</span>
            <button
              type="button"
              onClick={() => onResendMessage(msg.id)}
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-white text-red-700 hover:bg-red-50 transition-colors"
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
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-base font-bold truncate">{conversationTitle}</h1>
          <p className="text-xs text-slate-500">Scope: {conversationScope}</p>
        </div>

        <button
          type="button"
          onClick={onTogglePrivacyBlur}
          className={`min-h-[44px] px-3.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
            privacyBlurEnabled
              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
          }`}
          aria-label={privacyBlurEnabled ? 'Disable patient privacy blur' : 'Enable patient privacy blur'}
        >
          <span>{privacyBlurEnabled ? 'ON' : 'LOCK'}</span>
          <span>{privacyBlurEnabled ? 'Peek Mode: ON' : 'Privacy Blur'}</span>
        </button>
      </div>

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <div className="animate-spin text-3xl mb-2">...</div>
          <p className="text-sm">Loading message thread...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <div className="text-3xl mb-2">!</div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Error Loading Thread</p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
          <div className="text-3xl mb-2">E2EE</div>
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
            const isMe = msg.senderType === 'Staff' && msg.senderId === currentUserId;
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
                    <span>LOCK</span>
                    <span>INTERNAL CLINICAL NOTE — NEVER VISIBLE TO PATIENT</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${isObscured ? 'blur-sm select-none' : ''}`}>
                    {msg.contentText}
                  </p>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
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
                    <span className={`text-[11px] ${isMe ? 'text-white/80' : 'text-slate-400'}`}>
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

      {/* Input Bar */}
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
    </div>
  );
};
