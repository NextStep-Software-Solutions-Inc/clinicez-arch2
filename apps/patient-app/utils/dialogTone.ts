import type { DialogButton, DialogTone } from './dialogTypes';

/**
 * Resolves the semantic tone (error, warning, success, info) for an alert/dialog.
 * Prioritizes explicit options, then destructive action indicators, then keywords
 * in title and message.
 */
export function resolveDialogTone(
  title?: string,
  message?: string,
  buttons?: DialogButton[],
  explicitType?: DialogTone,
  destructive?: boolean
): DialogTone {
  if (explicitType) return explicitType;
  if (destructive) return 'warning';

  if (buttons && buttons.some((b) => b.style === 'destructive')) {
    return 'warning';
  }

  const text = `${title ?? ''} ${message ?? ''}`.toLowerCase();

  // Error takes highest priority
  if (/\b(error|failed|failure|invalid|denied|rejected|unable|cannot|could not|problem|unsuccessful)\b/i.test(text)) {
    return 'error';
  }

  // Warning (cautionary, required fields, destructive, offline)
  if (
    /\b(warning|caution|attention|alert|required|incomplete|offline|internet required|delete|remove|sign out|cancel appointment)\b/i.test(
      text
    )
  ) {
    return 'warning';
  }

  // Success (saved, updated, copied, verified, completed)
  if (/\b(success|saved|updated|copied|created|changed|verified|completed|done|confirmed)\b/i.test(text)) {
    return 'success';
  }

  return 'info';
}
