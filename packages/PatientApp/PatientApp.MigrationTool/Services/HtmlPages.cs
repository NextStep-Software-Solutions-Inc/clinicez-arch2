using System.Net;
using System.Text;
using PatientApp.MigrationTool.Models;

namespace PatientApp.MigrationTool.Services;

public static class HtmlPages
{
    public static string Login(string? error = null)
    {
        var errorHtml = string.IsNullOrWhiteSpace(error)
            ? string.Empty
            : $"""<p class="alert danger">{Encode(error)}</p>""";

        return Layout("Admin Login", $"""
            <section class="band narrow">
              <h1>PatientApp Migration</h1>
              <p class="muted">Internal migration console</p>
              {errorHtml}
              <form method="post" action="/login" class="stack">
                <label>
                  Admin key
                  <input type="password" name="adminKey" autocomplete="current-password" autofocus />
                </label>
                <button type="submit">Sign in</button>
              </form>
            </section>
            """);
    }

    public static string Dashboard(MigrationReport? report, bool configured)
    {
        var configAlert = configured
            ? string.Empty
            : """
              <p class="alert danger">Set PATIENTAPP_MIGRATION_SOURCE_CONNECTION, PATIENTAPP_MIGRATION_TARGET_CONNECTION, and PATIENTAPP_MIGRATION_ADMIN_KEY before running migration actions.</p>
              """;

        var reportHtml = report is null
            ? """<p class="muted">No migration run yet.</p>"""
            : ReportSummary(report);

        return Layout("Migration Console", $"""
            <header class="topbar">
              <div>
                <h1>PatientApp Migration Console</h1>
                <p class="muted">Dry-run first. Apply only writes to an empty target PatientApp database.</p>
              </div>
              <form method="post" action="/logout"><button type="submit" class="secondary">Sign out</button></form>
            </header>
            {configAlert}
            <section class="band">
              <form class="actions" method="post">
                <button formaction="/check" type="submit">Check connections</button>
                <button formaction="/scan" type="submit">Scan source</button>
                <button formaction="/dry-run" type="submit">Run dry-run</button>
              </form>
              <form class="actions danger-zone" method="post" action="/apply">
                <label>
                  Type APPLY to commit
                  <input name="confirmation" autocomplete="off" />
                </label>
                <button type="submit" class="danger">Apply migration</button>
              </form>
            </section>
            {reportHtml}
            """);
    }

    public static string Error(string message)
    {
        return Layout("Migration Error", $"""
            <section class="band narrow">
              <h1>Migration Error</h1>
              <p class="alert danger">{Encode(message)}</p>
              <p><a href="/">Return to console</a></p>
            </section>
            """);
    }

    public static string Report(MigrationReport report)
    {
        return Layout("Migration Report", $"""
            <header class="topbar">
              <div>
                <h1>Migration Report</h1>
                <p class="muted">Run {Encode(report.RunId)} - {Encode(report.Phase)}</p>
              </div>
              <p><a href="/">Return to console</a></p>
            </header>
            {ReportSummary(report)}
            """);
    }

    public static string ReportSummary(MigrationReport report)
    {
        var exportLinks = $"""
            <nav class="export-links">
              <a href="/export/html">HTML</a>
              <a href="/export/json">JSON</a>
              <a href="/export/tables.csv">Table CSV</a>
              <a href="/export/trash.csv">Trash CSV</a>
            </nav>
            """;

        return $"""
            <section class="band">
              <div class="metrics">
                {Metric("Phase", report.Phase)}
                {Metric("Source rows", report.TotalSourceRows.ToString("N0"))}
                {Metric("Transferable", report.TotalTransferableRows.ToString("N0"))}
                {Metric("Inserted", report.TotalInsertedRows.ToString("N0"))}
                {Metric("Trashed", report.TotalTrashedRows.ToString("N0"))}
                {Metric("Generated UUIDs", report.GeneratedUuidCount.ToString("N0"))}
              </div>
              {Messages(report)}
              {exportLinks}
            </section>
            <section class="band">
              <h2>Connections</h2>
              {ConnectionTable(report)}
            </section>
            <section class="band">
              <h2>Table Results</h2>
              {TableResults(report)}
            </section>
            <section class="band">
              <h2>Mappings</h2>
              {Mappings(report)}
            </section>
            <section class="band">
              <h2>Trash / Deprecated</h2>
              {Trash(report)}
            </section>
            <section class="band">
              <h2>ID Map Sample</h2>
              {IdMap(report)}
            </section>
            """;
    }

    public static string Styles() => """
        :root {
          color-scheme: light;
          --bg: #f7f8fa;
          --surface: #ffffff;
          --line: #d8dee8;
          --text: #1d2430;
          --muted: #5c6878;
          --accent: #146c94;
          --danger: #a92323;
          --ok: #1e6b42;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: var(--bg);
          color: var(--text);
          font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        main { max-width: 1320px; margin: 0 auto; padding: 24px; }
        h1, h2 { margin: 0 0 6px; letter-spacing: 0; }
        h1 { font-size: 28px; }
        h2 { font-size: 18px; }
        a { color: var(--accent); text-decoration: none; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; background: var(--surface); }
        th, td { border-bottom: 1px solid var(--line); padding: 9px 10px; text-align: left; vertical-align: top; }
        th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
        input {
          display: block;
          width: min(420px, 100%);
          margin-top: 6px;
          padding: 9px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #fff;
          color: var(--text);
        }
        button {
          min-height: 38px;
          padding: 8px 14px;
          border: 1px solid var(--accent);
          border-radius: 6px;
          background: var(--accent);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        button.secondary { background: #fff; color: var(--accent); }
        button.danger { background: var(--danger); border-color: var(--danger); }
        .topbar { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 18px; }
        .band {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .band.narrow { max-width: 520px; margin: 72px auto; }
        .muted { color: var(--muted); margin-top: 0; }
        .stack { display: grid; gap: 14px; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; margin-bottom: 12px; }
        .danger-zone { border-top: 1px solid var(--line); padding-top: 12px; margin-bottom: 0; }
        .alert { padding: 10px 12px; border-radius: 6px; border: 1px solid var(--line); }
        .alert.danger { border-color: #efb8b8; background: #fff5f5; color: var(--danger); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
        .metric { border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
        .metric span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; }
        .metric strong { display: block; margin-top: 2px; font-size: 20px; }
        .pill { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; background: #eef4f8; color: var(--accent); font-weight: 700; font-size: 12px; }
        .pill.danger { background: #fff0f0; color: var(--danger); }
        .pill.ok { background: #edf8f1; color: var(--ok); }
        .export-links { display: flex; gap: 12px; flex-wrap: wrap; }
        .scroll { overflow-x: auto; }
        @media (max-width: 720px) {
          main { padding: 14px; }
          .topbar { align-items: flex-start; flex-direction: column; }
          .actions { align-items: stretch; flex-direction: column; }
          button { width: 100%; }
        }
        """;

    private static string Layout(string title, string body)
    {
        return $"""
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>{Encode(title)}</title>
              <link rel="stylesheet" href="/style.css" />
            </head>
            <body>
              <main>{body}</main>
            </body>
            </html>
            """;
    }

    private static string Metric(string label, string value)
    {
        return $"""<div class="metric"><span>{Encode(label)}</span><strong>{Encode(value)}</strong></div>""";
    }

    private static string Messages(MigrationReport report)
    {
        if (report.Messages.Count == 0)
            return string.Empty;

        return "<ul>" + string.Join("", report.Messages.Select(message => $"<li>{Encode(message)}</li>")) + "</ul>";
    }

    private static string ConnectionTable(MigrationReport report)
    {
        var rows = new[] { report.SourceCheck, report.TargetCheck }
            .Where(check => check is not null)
            .Select(check =>
            {
                var value = check ?? new DatabaseCheckResult();
                return $"""
                    <tr>
                      <td>{Encode(value.Name)}</td>
                      <td>{Pill(value.Configured, "configured", "missing")}</td>
                      <td>{Pill(value.CanConnect, "connected", "failed")}</td>
                      <td>{Pill(value.IsTargetEmpty, "empty/ok", "not empty")}</td>
                      <td>{Encode(value.Message)}</td>
                    </tr>
                    """;
            });

        return $"""
            <div class="scroll">
            <table>
              <thead><tr><th>Name</th><th>Configured</th><th>Connection</th><th>Empty</th><th>Message</th></tr></thead>
              <tbody>{string.Join("", rows)}</tbody>
            </table>
            </div>
            """;
    }

    private static string TableResults(MigrationReport report)
    {
        if (report.TableResults.Count == 0)
            return """<p class="muted">No table migration results yet.</p>""";

        var rows = report.TableResults.Select(result => $"""
            <tr>
              <td>{Encode(result.SourceTable)}</td>
              <td>{Encode(result.TargetTable ?? "-")}</td>
              <td>{result.SourceRows:N0}</td>
              <td>{result.TransferableRows:N0}</td>
              <td>{result.InsertedRows:N0}</td>
              <td>{result.TrashedRows:N0}</td>
            </tr>
            """);

        return $"""
            <div class="scroll">
            <table>
              <thead><tr><th>Source</th><th>Target</th><th>Source Rows</th><th>Transferable</th><th>Inserted</th><th>Trashed</th></tr></thead>
              <tbody>{string.Join("", rows)}</tbody>
            </table>
            </div>
            """;
    }

    private static string Mappings(MigrationReport report)
    {
        if (report.TableMappings.Count == 0)
            return """<p class="muted">Run source scan to see mappings.</p>""";

        var rows = report.TableMappings.Select(mapping => $"""
            <tr>
              <td>{Encode(mapping.SourceTableKey)}</td>
              <td>{Encode(mapping.TargetTableName ?? "-")}</td>
              <td>{StatusPill(mapping.Status)}</td>
              <td>{mapping.Confidence}</td>
              <td>{Encode(mapping.Reason)}</td>
              <td>{Encode(string.Join("; ", mapping.ColumnMappings.Take(8).Select(c => $"{c.TargetColumn} <- {c.SourceColumn ?? c.Action}")))}</td>
            </tr>
            """);

        return $"""
            <div class="scroll">
            <table>
              <thead><tr><th>Source</th><th>Target</th><th>Status</th><th>Confidence</th><th>Reason</th><th>Column Sample</th></tr></thead>
              <tbody>{string.Join("", rows)}</tbody>
            </table>
            </div>
            """;
    }

    private static string Trash(MigrationReport report)
    {
        if (report.Trash.Count == 0)
            return """<p class="muted">No trash/deprecated rows reported.</p>""";

        var rows = report.Trash.Take(500).Select(entry => $"""
            <tr>
              <td>{Encode(entry.SourceTable)}</td>
              <td>{Encode(entry.SourceKey ?? "-")}</td>
              <td>{Encode(entry.TargetTable ?? "-")}</td>
              <td>{Encode(entry.ReasonCode)}</td>
              <td>{Encode(entry.Detail)}</td>
            </tr>
            """);

        var note = report.Trash.Count > 500
            ? $"""<p class="muted">Showing 500 of {report.Trash.Count:N0} trash entries. Export CSV for the full list.</p>"""
            : string.Empty;

        return $"""
            {note}
            <div class="scroll">
            <table>
              <thead><tr><th>Source</th><th>Key</th><th>Target</th><th>Reason</th><th>Detail</th></tr></thead>
              <tbody>{string.Join("", rows)}</tbody>
            </table>
            </div>
            """;
    }

    private static string IdMap(MigrationReport report)
    {
        if (report.IdMap.Count == 0)
            return """<p class="muted">No generated ID map yet.</p>""";

        var rows = report.IdMap.Take(300).Select(entry => $"""
            <tr>
              <td>{Encode(entry.SourceTable)}</td>
              <td>{Encode(entry.SourceKey)}</td>
              <td>{Encode(entry.TargetTable)}</td>
              <td><code>{Encode(entry.TargetId.ToString())}</code></td>
            </tr>
            """);

        return $"""
            <p class="muted">Showing up to 300 generated IDs in the UI. JSON export includes the stored sample.</p>
            <div class="scroll">
            <table>
              <thead><tr><th>Source Table</th><th>Old ID</th><th>Target Table</th><th>Generated UUID</th></tr></thead>
              <tbody>{string.Join("", rows)}</tbody>
            </table>
            </div>
            """;
    }

    private static string Pill(bool ok, string okText, string failText)
    {
        return ok
            ? $"""<span class="pill ok">{Encode(okText)}</span>"""
            : $"""<span class="pill danger">{Encode(failText)}</span>""";
    }

    private static string StatusPill(string status)
    {
        var css = status is "mapped" ? "ok" : status is "deprecated" or "unmapped" ? "danger" : string.Empty;
        return $"""<span class="pill {css}">{Encode(status)}</span>""";
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}

