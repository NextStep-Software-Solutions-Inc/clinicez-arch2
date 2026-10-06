import { theme } from '../constants/theme';
import type { PrintLetterhead } from './printHelper';

export async function openPrintableUrl(url: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
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

export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=450,height=600');
  if (!printWindow) {
    window.print();
    return;
  }

  const headerHtml = renderLines([letterhead?.header, letterhead?.subHeader, letterhead?.address, letterhead?.contact]);
  const footerHtml = renderLines([letterhead?.footer]);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
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
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
