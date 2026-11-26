import React, { useEffect, useState } from 'react';
import {
  IconCheck,
  IconCode,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, TabButton, TabList, Text } from '@/components/ui';
import type {
  SyncBindingDto,
  SyncConflictDto,
  TrackingSqlScriptsResponseDto,
} from '@/services/v1Sync.service';
import { toast } from 'sonner';

export interface ForceV1ConfirmModalProps {
  conflict: SyncConflictDto;
  busyAction: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function ForceV1ConfirmModal({
  conflict,
  busyAction,
  onClose,
  onConfirm,
}: ForceV1ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={() => {
        if (!busyAction) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-text">Replace with Classic (v1) Data</h3>
          <Button
            variant="ghost"
            size="iconSm"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            aria-label="Close modal"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          This will immediately re-sync{' '}
          <strong className="text-text">
            {conflict.entityType} #{conflict.v1Id}
          </strong>{' '}
          using Classic Clinic EZ (v1) as the source of truth, overwriting Clinic EZ v2 edits on:{' '}
          <span className="font-medium text-text">
            {conflict.changedFields.join(', ') || 'all synced fields'}
          </span>
          .
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" size="md" disabled={Boolean(busyAction)} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="unstyled"
            size="md"
            disabled={Boolean(busyAction)}
            onClick={onConfirm}
            className="font-semibold text-white bg-amber-600 hover:bg-amber-700"
          >
            {busyAction === 'Use Classic (v1)' ? 'Re-Syncing...' : 'Confirm & Replace with v1'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface FreezeConnectionModalProps {
  binding: SyncBindingDto;
  freezeReason: string;
  onChangeReason: (value: string) => void;
  freezeToken: string;
  onChangeToken: (value: string) => void;
  busyAction: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onOpenUninstallScript?: () => void;
}

export function FreezeConnectionModal({
  binding,
  freezeReason,
  onChangeReason,
  freezeToken,
  onChangeToken,
  busyAction,
  onClose,
  onConfirm,
  onOpenUninstallScript,
}: FreezeConnectionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={() => {
        if (!busyAction) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-text">Freeze &amp; Retire Connection</h3>
          <Button
            variant="ghost"
            size="iconSm"
            disabled={busyAction === 'freeze'}
            onClick={onClose}
            aria-label="Close modal"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Freezing <strong className="text-text">{binding.name}</strong> stops all ongoing transfers
          from Classic Clinic EZ and disables Auto-Sync. Only perform this after retiring the v1
          site and confirming the Record Verification Summary.
        </p>
        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            <Text as="label" htmlFor="freeze-reason" variant="label" className="text-xs">
              Reason
            </Text>
            <input
              id="freeze-reason"
              type="text"
              value={freezeReason}
              onChange={(e) => onChangeReason(e.target.value)}
              placeholder="e.g. Classic Clinic EZ retired after final verification"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <Text as="label" htmlFor="freeze-token" variant="label" className="text-xs">
              Type <code className="font-mono font-bold text-text">FREEZE</code> to confirm
            </Text>
            <input
              id="freeze-token"
              type="text"
              value={freezeToken}
              onChange={(e) => onChangeToken(e.target.value)}
              placeholder="FREEZE"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            {onOpenUninstallScript && (
              <Button
                variant="ghost"
                size="xs"
                leadingIcon={<IconCode className="h-3.5 w-3.5" />}
                disabled={busyAction === 'freeze'}
                onClick={onOpenUninstallScript}
              >
                Removal SQL
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="subtle" size="md" disabled={busyAction === 'freeze'} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={freezeToken.trim() !== 'FREEZE' || busyAction === 'freeze'}
              onClick={onConfirm}
            >
              {busyAction === 'freeze' ? 'Freezing...' : 'Confirm Freeze'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface TrackingScriptModalProps {
  initialTab: 'install' | 'uninstall';
  scripts: TrackingSqlScriptsResponseDto | null;
  loading: boolean;
  error: string | null;
  triggersInstalled: boolean;
  triggerTableCount: number;
  refreshingStatus: boolean;
  onRetryLoad: () => void;
  onRecheckStatus: () => void;
  onClose: () => void;
}

const SQL_KEYWORDS = new Set([
  'AFTER',
  'ALTER',
  'AND',
  'ARRAY',
  'AS',
  'BEGIN',
  'CASCADE',
  'CHECK',
  'COMMIT',
  'CREATE',
  'DECLARE',
  'DEFAULT',
  'DELETE',
  'DISTINCT',
  'DO',
  'DROP',
  'EACH',
  'ELSE',
  'ELSIF',
  'END',
  'EXECUTE',
  'EXISTS',
  'FOR',
  'FOREACH',
  'FROM',
  'FUNCTION',
  'IF',
  'IN',
  'INDEX',
  'INSERT',
  'INTO',
  'IS',
  'KEY',
  'LANGUAGE',
  'LOOP',
  'NOT',
  'NOTICE',
  'NULL',
  'ON',
  'OR',
  'PERFORM',
  'PRIMARY',
  'RAISE',
  'REPLACE',
  'RETURN',
  'RETURNS',
  'ROW',
  'SCHEMA',
  'SELECT',
  'SET',
  'TABLE',
  'THEN',
  'TRIGGER',
  'UPDATE',
  'VALUES',
  'WHERE',
]);

const SQL_TYPES = new Set([
  'BIGINT',
  'BIGSERIAL',
  'BOOLEAN',
  'CHAR',
  'INT',
  'INTEGER',
  'JSON',
  'JSONB',
  'NUMERIC',
  'RECORD',
  'SERIAL',
  'TEXT',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'UUID',
  'VARCHAR',
]);

const SQL_BUILTINS = new Set([
  'COALESCE',
  'FORMAT',
  'JSONB_BUILD_OBJECT',
  'JSONB_STRIP_NULLS',
  'NEW',
  'NOW',
  'OLD',
  'PLPGSQL',
  'TG_OP',
  'TG_TABLE_NAME',
  'TO_JSONB',
]);

const SQL_TOKEN_REGEX =
  /(--.*$)|('(?:''|[^'])*')|(\$\$)|(:=|->->|->>|->|\|\|)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

function highlightSqlLine(line: string, lineIdx: number): React.ReactNode {
  if (!line) return '\u00A0';

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenIdx = 0;

  SQL_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SQL_TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    const [full, comment, str, dollar, op, num, word] = match;
    const key = `${lineIdx}-${tokenIdx++}`;

    if (comment) {
      nodes.push(
        <span key={key} data-sql-token="comment" className="text-text-muted italic">
          {comment}
        </span>
      );
    } else if (str) {
      nodes.push(
        <span
          key={key}
          data-sql-token="string"
          className="text-emerald-700 dark:text-emerald-400"
        >
          {str}
        </span>
      );
    } else if (dollar) {
      nodes.push(
        <span
          key={key}
          data-sql-token="delimiter"
          className="text-amber-700 dark:text-amber-400 font-semibold"
        >
          {dollar}
        </span>
      );
    } else if (op) {
      nodes.push(
        <span
          key={key}
          data-sql-token="operator"
          className="text-rose-700 dark:text-rose-400 font-semibold"
        >
          {op}
        </span>
      );
    } else if (num) {
      nodes.push(
        <span key={key} data-sql-token="number" className="text-amber-700 dark:text-amber-400">
          {num}
        </span>
      );
    } else if (word) {
      const upper = word.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        nodes.push(
          <span
            key={key}
            data-sql-token="keyword"
            className="text-indigo-700 dark:text-indigo-400 font-semibold"
          >
            {word}
          </span>
        );
      } else if (SQL_TYPES.has(upper)) {
        nodes.push(
          <span
            key={key}
            data-sql-token="type"
            className="text-teal-700 dark:text-teal-400 font-medium"
          >
            {word}
          </span>
        );
      } else if (SQL_BUILTINS.has(upper)) {
        nodes.push(
          <span key={key} data-sql-token="builtin" className="text-sky-700 dark:text-sky-400">
            {word}
          </span>
        );
      } else if (word === '_v1_sync' || word === 'public' || word === 'information_schema') {
        nodes.push(
          <span
            key={key}
            data-sql-token="schema"
            className="text-violet-700 dark:text-violet-400 font-medium"
          >
            {word}
          </span>
        );
      } else if (word.startsWith('v_')) {
        nodes.push(
          <span
            key={key}
            data-sql-token="variable"
            className="text-amber-700 dark:text-amber-300"
          >
            {word}
          </span>
        );
      } else {
        nodes.push(full);
      }
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function HighlightedSqlViewer({ sql }: { sql: string }) {
  const lines = sql.split(/\r?\n/);

  return (
    <div
      data-testid="sql-syntax-viewer"
      className="flex-1 min-h-0 rounded-xl bg-surface-muted/50 border border-border overflow-auto"
    >
      <pre className="py-3 text-[11px] leading-relaxed font-mono text-text">
        <code className="block min-w-max">
          {lines.map((line, idx) => (
            <div key={idx} className="flex hover:bg-surface-muted/70 px-3">
              <span
                aria-hidden="true"
                className="w-8 pr-3 mr-3 text-right select-none text-text-muted/60 border-r border-border/70 shrink-0 tabular-nums"
              >
                {idx + 1}
              </span>
              <span className="whitespace-pre">{highlightSqlLine(line, idx)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function TrackingScriptModal({
  initialTab,
  scripts,
  loading,
  error,
  triggersInstalled,
  triggerTableCount,
  refreshingStatus,
  onRetryLoad,
  onRecheckStatus,
  onClose,
}: TrackingScriptModalProps) {
  const [activeTab, setActiveTab] = useState<'install' | 'uninstall'>(initialTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
    setCopied(false);
  }, [initialTab]);

  const activeScript = scripts ? (activeTab === 'install' ? scripts.install : scripts.uninstall) : null;

  const handleCopy = async () => {
    if (!activeScript) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeScript.sql);
        setCopied(true);
        toast.success(`Copied ${activeScript.fileName} to clipboard.`);
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error('Clipboard access is unavailable in this browser. Use Download instead.');
      }
    } catch {
      toast.error('Unable to copy automatically. Use Download instead.');
    }
  };

  const handleDownload = () => {
    if (!activeScript || typeof document === 'undefined') return;
    const blob = new Blob([activeScript.sql], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeScript.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${activeScript.fileName}.`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Classic (v1) Live Tracking SQL"
        onClick={(e) => e.stopPropagation()}
        className="max-w-3xl w-full max-h-[88vh] flex flex-col rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-text">
                Classic (v1) Live Tracking SQL
              </h3>
              <Chip tone={triggersInstalled ? 'success' : 'warning'} size="xs">
                {triggersInstalled
                  ? `Live tracking active (${triggerTableCount} tables)`
                  : 'Tracking not enabled'}
              </Chip>
            </div>
            <p className="text-xs text-text-muted">
              Run the setup script once in your Classic Clinic EZ PostgreSQL SQL editor (such as Neon
              or psql) so Auto-Sync can capture live updates automatically.
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            aria-label="Close tracking script dialog"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
          <TabList ariaLabel="Tracking SQL script mode">
            <TabButton
              active={activeTab === 'install'}
              onClick={() => {
                setActiveTab('install');
                setCopied(false);
              }}
            >
              Enable Tracking
            </TabButton>
            <TabButton
              active={activeTab === 'uninstall'}
              onClick={() => {
                setActiveTab('uninstall');
                setCopied(false);
              }}
            >
              Remove Tracking
            </TabButton>
          </TabList>

          {activeScript && (
            <Text variant="mono" className="text-[11px] text-text-muted">
              {activeScript.fileName}
            </Text>
          )}
        </div>

        <div className="px-6 py-3 space-y-3 flex-1 min-h-0 flex flex-col">
          {activeScript && (
            <p className="text-xs text-text-muted leading-relaxed">{activeScript.description}</p>
          )}

          {loading ? (
            <div className="p-8 rounded-xl bg-surface-muted/50 border border-border text-center text-xs text-text-muted">
              Loading SQL script...
            </div>
          ) : error ? (
            <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="dangerSubtle" size="xs" onClick={onRetryLoad}>
                Retry
              </Button>
            </div>
          ) : activeScript ? (
            <HighlightedSqlViewer sql={activeScript.sql} />
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-border bg-surface-muted/30 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshingStatus}
            leadingIcon={
              <IconRefresh className={`h-3.5 w-3.5 ${refreshingStatus ? 'animate-spin' : ''}`} />
            }
            onClick={onRecheckStatus}
          >
            Re-check Status
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!activeScript}
              leadingIcon={<IconDownload className="h-3.5 w-3.5" />}
              onClick={handleDownload}
            >
              Download .sql
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!activeScript}
              leadingIcon={
                copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />
              }
              onClick={() => void handleCopy()}
            >
              {copied ? 'Copied' : 'Copy SQL'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
