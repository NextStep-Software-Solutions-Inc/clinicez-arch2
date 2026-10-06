export async function openPrintableUrl(url: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

export function printReceiptDialog(title: string, details: string) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=450,height=600');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            padding: 24px;
            font-size: 13px;
            color: #111;
            line-height: 1.4;
          }
          h2 {
            font-size: 16px;
            margin-bottom: 8px;
            text-align: center;
            border-bottom: 1px dashed #666;
            padding-bottom: 8px;
          }
          pre {
            white-space: pre-wrap;
            font-family: inherit;
          }
          .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 11px;
            border-top: 1px dashed #666;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <pre>${details}</pre>
        <div class="footer">
          ClinicEz POS & EMR Workstation<br/>
          Thank you for trusting St. Jude Family Clinic
        </div>
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
