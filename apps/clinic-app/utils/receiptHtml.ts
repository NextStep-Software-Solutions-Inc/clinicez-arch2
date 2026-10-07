import { theme } from '../constants/theme';

/**
 * Facility letterhead printed around a receipt. Every field is optional so callers
 * can pass `useClinic().letterhead` straight through; empty values are skipped.
 */
export interface PrintLetterhead {
  header?: string;
  subHeader?: string;
  address?: string;
  contact?: string;
  footer?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders non-empty lines as `<div>`s, escaping every value. */
function renderLines(lines: Array<string | undefined>): string {
  return lines
    .map((line) => line?.trim())
    .filter((line): line is string => !!line)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');
}

/** The receipt as a standalone HTML document, shared by the browser print window and the native print sheet. */
export function buildReceiptHtml(
  title: string,
  details: string,
  letterhead?: PrintLetterhead
): string {
  const headerHtml = renderLines([letterhead?.header, letterhead?.subHeader, letterhead?.address, letterhead?.contact]);
  const footerHtml = renderLines([letterhead?.footer]);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            padding: ${theme.spacing['2xl']}px;
            font-size: ${theme.fontSizes.sm}px;
            color: ${theme.colors.text};
            line-height: 1.4;
          }
          .letterhead {
            text-align: center;
            margin-bottom: ${theme.spacing.md}px;
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textSecondary};
          }
          .letterhead div:first-child {
            font-size: ${theme.fontSizes.lg}px;
            font-weight: 700;
            color: ${theme.colors.text};
          }
          h2 {
            font-size: ${theme.fontSizes.lg}px;
            margin-bottom: ${theme.spacing.sm}px;
            text-align: center;
            border-bottom: 1px dashed ${theme.colors.textMuted};
            padding-bottom: ${theme.spacing.sm}px;
          }
          pre {
            white-space: pre-wrap;
            font-family: inherit;
          }
          .footer {
            margin-top: ${theme.spacing.xl}px;
            text-align: center;
            font-size: ${theme.fontSizes.xs}px;
            border-top: 1px dashed ${theme.colors.textMuted};
            padding-top: ${theme.spacing.sm}px;
          }
        </style>
      </head>
      <body>
        ${headerHtml ? `<div class="letterhead">${headerHtml}</div>` : ''}
        <h2>${escapeHtml(title)}</h2>
        <pre>${escapeHtml(details)}</pre>
        ${footerHtml ? `<div class="footer">${footerHtml}</div>` : ''}
      </body>
    </html>
  `;
}
