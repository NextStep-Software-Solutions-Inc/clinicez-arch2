using System.Net;
using System.Text;
using System.Text.Json;
using ClinicEz.Patient.MigrationTool.Models;

namespace ClinicEz.Patient.MigrationTool.Services;

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
              <p><a href="/mapping">Review and edit mapping configuration</a></p>
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

    public static string MappingEditor(
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MappingPlan plan,
        MigrationMappingConfiguration configuration,
        string configurationPath,
        string? message = null)
    {
        var sourceTables = sourceSchema.Tables
            .OrderBy(table => table.Schema, StringComparer.OrdinalIgnoreCase)
            .ThenBy(table => table.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var messageHtml = string.IsNullOrWhiteSpace(message)
            ? string.Empty
            : $"""<p class="alert ok">{Encode(message)}</p>""";

        var orderedTargetTables = plan.TargetInsertOrder
            .Select(targetSchema.FindTable)
            .Where(table => table is not null)
            .Select(table => table!)
            .Concat(targetSchema.Tables
                .Where(table => !plan.TargetInsertOrder.Contains(table.Name, StringComparer.OrdinalIgnoreCase))
                .OrderBy(table => table.Name, StringComparer.OrdinalIgnoreCase))
            .ToArray();
        var sourceColumnsJson = JsonSerializer.Serialize(sourceTables.ToDictionary(
            table => table.Key,
            table => table.Columns
                .OrderBy(column => column.Ordinal)
                .Select(column => new
                {
                    name = column.Name,
                    label = $"{column.Name} ({column.DataType})",
                    category = GetSourceTypeCategory(column) ?? "unknown",
                })
                .ToArray(),
            StringComparer.OrdinalIgnoreCase));
        var relatedTablesJson = JsonSerializer.Serialize(sourceTables.ToDictionary(
            table => table.Key,
            table => GetRelatedSourceTables(table, sourceTables)
                .Select(related => new
                {
                    key = related.Key,
                    label = $"{related.Key} ({related.RowCount.GetValueOrDefault():N0} rows) - {BuildRelationshipSummary(table, related)}",
                })
                .ToArray(),
            StringComparer.OrdinalIgnoreCase));

        var tableCards = orderedTargetTables.Select((targetTable, tableIndex) =>
        {
            var manualSourceKey = configuration.Tables
                .Where(entry =>
                    !entry.Value.Trash
                    && !entry.Value.ForceUnmapped
                    && string.Equals(entry.Value.TargetTableName, targetTable.Name, StringComparison.OrdinalIgnoreCase))
                .Select(entry => entry.Key)
                .FirstOrDefault();
            var inferredMapping = plan.FindMappingsForTarget(targetTable.Name)
                .OrderByDescending(mapping => mapping.Status == "manual")
                .ThenByDescending(mapping => mapping.Confidence)
                .ThenBy(mapping => mapping.SourceTableKey, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
            var selectedSourceKey = manualSourceKey ?? string.Empty;
            var autoSourceKey = inferredMapping?.SourceTableKey ?? string.Empty;
            var effectiveSourceKey = string.IsNullOrWhiteSpace(selectedSourceKey)
                ? autoSourceKey
                : selectedSourceKey;
            var sourceTable = string.IsNullOrWhiteSpace(effectiveSourceKey)
                ? null
                : sourceSchema.FindTable(effectiveSourceKey);
            var mapping = sourceTable is null
                ? inferredMapping ?? new TableMapping
                {
                    TargetTableName = targetTable.Name,
                    Status = "unmapped",
                    Reason = "No source table is mapped to this target table.",
                }
                : plan.FindMappingForSource(sourceTable.Key) ?? inferredMapping ?? new TableMapping
                {
                    SourceTableKey = sourceTable.Key,
                    SourceTableName = sourceTable.Name,
                    TargetTableName = targetTable.Name,
                    Status = "unmapped",
                    Reason = "No source table is mapped to this target table.",
                };
            var tableOverride = sourceTable is null ? null : configuration.FindTable(sourceTable.Key);
            var sourceSummary = sourceTable is null
                ? "No source selected"
                : $"{sourceTable.Key} - {sourceTable.RowCount.GetValueOrDefault():N0} rows - {sourceTable.Columns.Count:N0} columns";
            var autoText = string.IsNullOrWhiteSpace(autoSourceKey)
                ? "Auto: no source"
                : $"Auto: {autoSourceKey}";

            return $"""
                <article class="mapping-card" data-target-card data-auto-source-key="{Attr(autoSourceKey)}">
                  <input type="hidden" name="targetTableName_{tableIndex}" value="{Attr(targetTable.Name)}" />
                  <input type="hidden" name="autoSourceTableKey_{tableIndex}" value="{Attr(autoSourceKey)}" />
                  <input type="hidden" name="columnCount_{tableIndex}" value="{targetTable.Columns.Count}" />
                  <div class="mapping-head">
                    <div>
                      <h3>{Encode(targetTable.Name)}</h3>
                      <p class="muted">Target table - {targetTable.Columns.Count:N0} columns - {StatusPill(mapping.Status)}</p>
                    </div>
                    <label>
                      Source table
                      <select name="sourceTableKey_{tableIndex}" data-source-table-select>
                        <option value=""{Selected(selectedSourceKey, string.Empty)}>{Encode(autoText)}</option>
                        <option value="__none__"{Selected(selectedSourceKey, "__none__")}>No source / skip inferred table</option>
                        {SourceTableOptions(sourceTables, selectedSourceKey)}
                      </select>
                    </label>
                  </div>
                  <p class="muted">Current source: {Encode(sourceSummary)}</p>
                  <p class="muted">{Encode(mapping.Reason)}</p>
                  {TargetColumnMappingRows(sourceTables, sourceTable, targetTable, mapping, tableOverride, tableIndex)}
                </article>
                """;
        });

        return Layout("Mapping Configuration", $"""
            <header class="topbar">
              <div>
                <h1>Mapping Configuration</h1>
                <p class="muted">Manual table and column overrides are saved to {Encode(configurationPath)}.</p>
              </div>
              <p><a href="/">Return to console</a></p>
            </header>
            {messageHtml}
            <section class="band">
              <p class="muted">Map from PatientApp targets to legacy sources: choose a target table card, pick its primary row source table, then connect each target column to that primary table or to a source table connected by FK metadata. Leave a row on Auto to keep the inferred mapping or generated/default value.</p>
              <form class="actions" method="post" action="/mapping/reset">
                <button class="secondary" type="submit">Reset saved overrides</button>
              </form>
            </section>
            <form method="post" action="/mapping/save">
              <input type="hidden" name="mappingMode" value="target-first" />
              <input type="hidden" name="targetCount" value="{orderedTargetTables.Length}" />
              {string.Join("", tableCards)}
              <section class="sticky-actions">
                <button type="submit">Save mapping configuration</button>
                <a href="/">Cancel</a>
              </section>
            </form>
            {MappingEditorScript(sourceColumnsJson, relatedTablesJson)}
            """);
    }

    public static string SourceMappingEditor(
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MappingPlan plan,
        MigrationMappingConfiguration configuration,
        string configurationPath,
        string? message = null)
    {
        var sourceTables = sourceSchema.Tables
            .OrderBy(table => table.Schema, StringComparer.OrdinalIgnoreCase)
            .ThenBy(table => table.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var messageHtml = string.IsNullOrWhiteSpace(message)
            ? string.Empty
            : $"""<p class="alert ok">{Encode(message)}</p>""";

        var tableCards = sourceTables.Select((sourceTable, tableIndex) =>
        {
            var mapping = plan.FindMappingForSource(sourceTable.Key) ?? new TableMapping
            {
                SourceTableKey = sourceTable.Key,
                SourceTableName = sourceTable.Name,
                Status = "unmapped",
            };
            var tableOverride = configuration.FindTable(sourceTable.Key);
            var selectedTarget = tableOverride?.Trash == true
                ? "__trash__"
                : tableOverride?.ForceUnmapped == true
                    ? "__unmapped__"
                    : tableOverride?.TargetTableName ?? string.Empty;
            var effectiveTargetName = tableOverride?.Trash == true || tableOverride?.ForceUnmapped == true
                ? null
                : tableOverride?.TargetTableName ?? mapping.TargetTableName;
            var targetTable = string.IsNullOrWhiteSpace(effectiveTargetName)
                ? null
                : targetSchema.FindTable(effectiveTargetName);
            var columnRows = targetTable is null
                ? """<p class="muted">Choose a target table and save to edit column mappings for this source table.</p>"""
                : ColumnMappingRows(sourceTable, targetTable, mapping, tableOverride, tableIndex);
            var inferredText = mapping.TargetTableName is null
                ? "Auto: no target"
                : $"Auto: {mapping.TargetTableName}";

            return $"""
                <article class="mapping-card">
                  <input type="hidden" name="sourceTableKey_{tableIndex}" value="{Attr(sourceTable.Key)}" />
                  <input type="hidden" name="columnCount_{tableIndex}" value="{(targetTable?.Columns.Count ?? 0)}" />
                  <div class="mapping-head">
                    <div>
                      <h3>{Encode(sourceTable.Key)}</h3>
                      <p class="muted">{sourceTable.RowCount.GetValueOrDefault():N0} rows - {sourceTable.Columns.Count:N0} columns - {StatusPill(mapping.Status)}</p>
                    </div>
                    <label>
                      Target table
                      <select name="targetTable_{tableIndex}">
                        <option value=""{Selected(selectedTarget, string.Empty)}>{Encode(inferredText)}</option>
                        <option value="__unmapped__"{Selected(selectedTarget, "__unmapped__")}>Force unmapped</option>
                        <option value="__trash__"{Selected(selectedTarget, "__trash__")}>Trash / deprecated</option>
                        {TargetOptions(targetSchema, selectedTarget)}
                      </select>
                    </label>
                  </div>
                  <p class="muted">{Encode(mapping.Reason)}</p>
                  {columnRows}
                </article>
                """;
        });

        return Layout("Mapping Configuration", $"""
            <header class="topbar">
              <div>
                <h1>Mapping Configuration</h1>
                <p class="muted">Manual table and column overrides are saved to {Encode(configurationPath)}.</p>
              </div>
              <p><a href="/">Return to console</a></p>
            </header>
            {messageHtml}
            <section class="band">
              <p class="muted">Leave fields on Auto to keep inferred mapping. Save after changing a target table, then reopen this page to edit that target table's columns.</p>
              <form class="actions" method="post" action="/mapping/reset">
                <button class="secondary" type="submit">Reset saved overrides</button>
              </form>
            </section>
            <form method="post" action="/mapping/save">
              <input type="hidden" name="tableCount" value="{sourceTables.Length}" />
              {string.Join("", tableCards)}
              <section class="sticky-actions">
                <button type="submit">Save mapping configuration</button>
                <a href="/">Cancel</a>
              </section>
            </form>
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
        select {
          display: block;
          width: min(520px, 100%);
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
        .alert.ok { border-color: #b8e7c8; background: #f2fbf5; color: var(--ok); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
        .metric { border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
        .metric span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; }
        .metric strong { display: block; margin-top: 2px; font-size: 20px; }
        .pill { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; background: #eef4f8; color: var(--accent); font-weight: 700; font-size: 12px; }
        .pill.danger { background: #fff0f0; color: var(--danger); }
        .pill.ok { background: #edf8f1; color: var(--ok); }
        .export-links { display: flex; gap: 12px; flex-wrap: wrap; }
        .scroll { overflow-x: auto; }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .mapping-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .mapping-arrow { color: var(--muted); font-weight: 700; margin-left: 8px; }
        .mapping-card h3 { margin: 0 0 4px; font-size: 16px; }
        .mapping-head {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(240px, 420px);
          gap: 14px;
          align-items: start;
        }
        .column-grid {
          display: grid;
          grid-template-columns: minmax(150px, 1fr) minmax(130px, .75fr) minmax(190px, 1.1fr) minmax(190px, 1.1fr) minmax(190px, 1.1fr);
          gap: 8px 12px;
          align-items: center;
          margin-top: 12px;
        }
        .column-grid .head {
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .type-warning {
          margin: 6px 0 0;
          color: #8a5a00;
          font-size: 12px;
          line-height: 1.35;
        }
        .sticky-actions {
          position: sticky;
          bottom: 0;
          display: flex;
          gap: 14px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 8px 8px 0 0;
          background: rgba(255, 255, 255, .96);
          padding: 14px;
        }
        @media (max-width: 720px) {
          main { padding: 14px; }
          .topbar { align-items: flex-start; flex-direction: column; }
          .actions { align-items: stretch; flex-direction: column; }
          .mapping-head, .column-grid { grid-template-columns: 1fr; }
          .column-grid .head { display: none; }
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
              <td>{Encode(string.Join("; ", mapping.ColumnMappings.Take(8).Select(FormatColumnMapping)))}</td>
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

    private static string FormatColumnMapping(ColumnMapping column)
    {
        var value = string.IsNullOrWhiteSpace(column.SourceColumn)
            ? $"{column.TargetColumn} <- {column.Action}"
            : string.IsNullOrWhiteSpace(column.SourceTableKey)
                ? $"{column.TargetColumn} <- {column.SourceColumn}"
                : $"{column.TargetColumn} <- {column.SourceTableKey}.{column.SourceColumn}";

        if (!string.IsNullOrWhiteSpace(column.Transform))
            value += $" [{column.Transform}]";

        if (!string.IsNullOrWhiteSpace(column.Warning))
            value += $" ({column.Warning})";

        return value;
    }

    private static string StatusPill(string status)
    {
        var css = status is "mapped" or "manual"
            ? "ok"
            : status is "deprecated" or "unmapped" or "manual_trash" or "manual_unmapped" or "manual_missing_target"
                ? "danger"
                : string.Empty;
        return $"""<span class="pill {css}">{Encode(status)}</span>""";
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);

    private static string Attr(string value) => WebUtility.HtmlEncode(value);

    private static string Selected(string selectedValue, string optionValue)
    {
        return string.Equals(selectedValue, optionValue, StringComparison.OrdinalIgnoreCase)
            ? " selected"
            : string.Empty;
    }

    private static string TargetOptions(TargetDatabaseSchema targetSchema, string selectedTarget)
    {
        var hasSelectedTarget = string.IsNullOrWhiteSpace(selectedTarget)
            || selectedTarget is "__unmapped__" or "__trash__"
            || targetSchema.FindTable(selectedTarget) is not null;
        var missingTargetOption = hasSelectedTarget
            ? string.Empty
            : $"""<option value="{Attr(selectedTarget)}" selected>Missing target: {Encode(selectedTarget)}</option>""";

        return string.Join(
            "",
            targetSchema.Tables
                .OrderBy(table => table.Name, StringComparer.OrdinalIgnoreCase)
                .Select(table => $"""<option value="{Attr(table.Name)}"{Selected(selectedTarget, table.Name)}>{Encode(table.Name)}</option>"""))
            + missingTargetOption;
    }

    private static string SourceTableOptions(IReadOnlyList<SourceTableInfo> sourceTables, string selectedSource)
    {
        var hasSelectedSource = string.IsNullOrWhiteSpace(selectedSource)
            || selectedSource == "__none__"
            || sourceTables.Any(table => string.Equals(table.Key, selectedSource, StringComparison.OrdinalIgnoreCase));
        var missingSourceOption = hasSelectedSource
            ? string.Empty
            : $"""<option value="{Attr(selectedSource)}" selected>Missing source: {Encode(selectedSource)}</option>""";

        return string.Join(
            "",
            sourceTables.Select(table =>
            {
                var label = $"{table.Key} ({table.RowCount.GetValueOrDefault():N0} rows)";
                return $"""<option value="{Attr(table.Key)}"{Selected(selectedSource, table.Key)}>{Encode(label)}</option>""";
            }))
            + missingSourceOption;
    }

    private static string SecondarySourceTableOptions(
        IReadOnlyList<SourceTableInfo> relatedSourceTables,
        SourceTableInfo? primarySourceTable,
        string selectedSource)
    {
        var hasSelectedSource = string.IsNullOrWhiteSpace(selectedSource)
            || relatedSourceTables.Any(table => string.Equals(table.Key, selectedSource, StringComparison.OrdinalIgnoreCase));
        var missingSourceOption = hasSelectedSource
            ? string.Empty
            : $"""<option value="{Attr(selectedSource)}" selected>Missing or unrelated source: {Encode(selectedSource)}</option>""";

        return string.Join(
            "",
            relatedSourceTables.Select(table =>
            {
                var relationship = primarySourceTable is null
                    ? string.Empty
                    : $" - {BuildRelationshipSummary(primarySourceTable, table)}";
                var label = $"{table.Key} ({table.RowCount.GetValueOrDefault():N0} rows){relationship}";
                return $"""<option value="{Attr(table.Key)}"{Selected(selectedSource, table.Key)}>{Encode(label)}</option>""";
            }))
            + missingSourceOption;
    }

    private static IReadOnlyList<SourceTableInfo> GetRelatedSourceTables(
        SourceTableInfo primarySourceTable,
        IReadOnlyList<SourceTableInfo> sourceTables)
    {
        return sourceTables
            .Where(table =>
                !string.Equals(table.Key, primarySourceTable.Key, StringComparison.OrdinalIgnoreCase)
                && SourceTablesAreRelated(primarySourceTable, table))
            .OrderBy(table => table.Schema, StringComparer.OrdinalIgnoreCase)
            .ThenBy(table => table.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool SourceTablesAreRelated(SourceTableInfo primarySourceTable, SourceTableInfo otherSourceTable)
    {
        return primarySourceTable.ForeignKeys.Any(fk =>
                string.Equals(fk.ReferencedKey, otherSourceTable.Key, StringComparison.OrdinalIgnoreCase))
            || otherSourceTable.ForeignKeys.Any(fk =>
                string.Equals(fk.ReferencedKey, primarySourceTable.Key, StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildRelationshipSummary(SourceTableInfo primarySourceTable, SourceTableInfo relatedSourceTable)
    {
        var outbound = primarySourceTable.ForeignKeys.FirstOrDefault(fk =>
            string.Equals(fk.ReferencedKey, relatedSourceTable.Key, StringComparison.OrdinalIgnoreCase));
        if (outbound is not null)
            return $"{primarySourceTable.Name}.{outbound.ColumnName} -> {relatedSourceTable.Name}.{outbound.ReferencedColumn}";

        var inbound = relatedSourceTable.ForeignKeys.FirstOrDefault(fk =>
            string.Equals(fk.ReferencedKey, primarySourceTable.Key, StringComparison.OrdinalIgnoreCase));
        if (inbound is not null)
            return $"{relatedSourceTable.Name}.{inbound.ColumnName} -> {primarySourceTable.Name}.{inbound.ReferencedColumn}";

        return "FK related";
    }

    private static string TargetColumnMappingRows(
        IReadOnlyList<SourceTableInfo> sourceTables,
        SourceTableInfo? sourceTable,
        TargetTableInfo targetTable,
        TableMapping mapping,
        TableMappingOverride? tableOverride,
        int tableIndex)
    {
        IReadOnlyList<SourceTableInfo> relatedSourceTables = sourceTable is null
            ? Array.Empty<SourceTableInfo>()
            : GetRelatedSourceTables(sourceTable, sourceTables);
        var rows = targetTable.Columns.Select((targetColumn, columnIndex) =>
        {
            var columnMapping = mapping.ColumnMappings.FirstOrDefault(column =>
                string.Equals(column.TargetColumn, targetColumn.Name, StringComparison.OrdinalIgnoreCase));
            var columnOverride = tableOverride?.FindColumnSource(targetColumn.Name);
            var overrideSourceTable = columnOverride?.SourceTableKey;
            var selectedSourceTable = string.Equals(overrideSourceTable, sourceTable?.Key, StringComparison.OrdinalIgnoreCase)
                ? string.Empty
                : overrideSourceTable ?? string.Empty;
            var selectedSource = columnOverride?.SourceColumnName ?? tableOverride?.FindSourceColumn(targetColumn.Name) ?? string.Empty;
            var selectedTransform = NormalizeTransform(columnOverride?.Transform);
            var effectiveSourceTable = string.IsNullOrWhiteSpace(selectedSourceTable)
                ? sourceTable
                : relatedSourceTables.FirstOrDefault(table => string.Equals(table.Key, selectedSourceTable, StringComparison.OrdinalIgnoreCase))
                    ?? sourceTables.FirstOrDefault(table => string.Equals(table.Key, selectedSourceTable, StringComparison.OrdinalIgnoreCase));
            var effectiveSourceColumn = string.IsNullOrWhiteSpace(selectedSource)
                ? null
                : effectiveSourceTable?.FindColumn(selectedSource);
            var autoText = columnMapping?.SourceColumn is null
                ? $"Auto: {columnMapping?.Action ?? "default"}"
                : $"Auto: {columnMapping.SourceTableKey ?? sourceTable?.Key}.{columnMapping.SourceColumn}";
            var columnKey = $"{tableIndex}_{columnIndex}";
            var warning = BuildTypeWarning(effectiveSourceColumn, targetColumn, selectedTransform);
            var warningHtml = string.IsNullOrWhiteSpace(warning)
                ? """<p class="type-warning" data-type-warning hidden></p>"""
                : $"""<p class="type-warning" data-type-warning>{Encode(warning)}</p>""";

            return $"""
                <input type="hidden" name="targetColumn_{tableIndex}_{columnIndex}" value="{Attr(targetColumn.Name)}" />
                <div>
                  <code>{Encode(targetColumn.Name)}</code>
                  <span class="mapping-arrow">-&gt;</span>
                </div>
                <div class="muted">{Encode(targetColumn.ClrTypeName)}{(targetColumn.IsNullable ? " nullable" : " required")}</div>
                <label>
                  <span class="sr-only">Secondary source table for {Encode(targetColumn.Name)}</span>
                  <select name="sourceTableForColumn_{tableIndex}_{columnIndex}" data-column-source-table-select data-column-key="{Attr(columnKey)}" data-selected-source-table="{Attr(selectedSourceTable)}">
                    <option value=""{Selected(selectedSourceTable, string.Empty)}>Primary source table</option>
                    {SecondarySourceTableOptions(relatedSourceTables, sourceTable, selectedSourceTable)}
                  </select>
                </label>
                <label>
                  <span class="sr-only">Source column for {Encode(targetColumn.Name)}</span>
                  <select name="sourceColumn_{tableIndex}_{columnIndex}" data-source-column-select data-source-column-key="{Attr(columnKey)}" data-target-category="{Attr(GetTargetTypeCategory(targetColumn) ?? "unknown")}" data-selected-source="{Attr(selectedSource)}" data-auto-label="{Attr(autoText)}">
                    <option value=""{Selected(selectedSource, string.Empty)}>{Encode(autoText)}</option>
                    {SourceColumnOptions(effectiveSourceTable, selectedSource)}
                  </select>
                </label>
                <div>
                  <label>
                    <span class="sr-only">Transform for {Encode(targetColumn.Name)}</span>
                    <select name="transform_{tableIndex}_{columnIndex}" data-transform-select data-transform-key="{Attr(columnKey)}">
                      <option value=""{Selected(selectedTransform, string.Empty)}>Auto</option>
                      <option value="convert"{Selected(selectedTransform, "convert")}>Convert to target type</option>
                      <option value="json_stringify"{Selected(selectedTransform, "json_stringify")}>Stringify JSON</option>
                    </select>
                  </label>
                  {warningHtml}
                </div>
                """;
        });

        return $"""
            <div class="column-grid">
              <div class="head">Target column</div>
              <div class="head">Target type</div>
              <div class="head">Secondary source</div>
              <div class="head">Source column</div>
              <div class="head">Transform</div>
              {string.Join("", rows)}
            </div>
            """;
    }

    private static string ColumnMappingRows(
        SourceTableInfo sourceTable,
        TargetTableInfo targetTable,
        TableMapping mapping,
        TableMappingOverride? tableOverride,
        int tableIndex)
    {
        var rows = targetTable.Columns.Select((targetColumn, columnIndex) =>
        {
            var columnMapping = mapping.ColumnMappings.FirstOrDefault(column =>
                string.Equals(column.TargetColumn, targetColumn.Name, StringComparison.OrdinalIgnoreCase));
            var selectedSource = tableOverride?.FindSourceColumn(targetColumn.Name) ?? string.Empty;
            var autoText = columnMapping?.SourceColumn is null
                ? $"Auto: {columnMapping?.Action ?? "default"}"
                : $"Auto: {columnMapping.SourceColumn}";

            return $"""
                <input type="hidden" name="targetColumn_{tableIndex}_{columnIndex}" value="{Attr(targetColumn.Name)}" />
                <div><code>{Encode(targetColumn.Name)}</code></div>
                <div class="muted">{Encode(targetColumn.ClrTypeName)}{(targetColumn.IsNullable ? " nullable" : " required")}</div>
                <label>
                  <span class="sr-only">Source column for {Encode(targetColumn.Name)}</span>
                  <select name="sourceColumn_{tableIndex}_{columnIndex}">
                    <option value=""{Selected(selectedSource, string.Empty)}>{Encode(autoText)}</option>
                    {SourceColumnOptions(sourceTable, selectedSource)}
                  </select>
                </label>
                """;
        });

        return $"""
            <div class="column-grid">
              <div class="head">Target column</div>
              <div class="head">Target type</div>
              <div class="head">Source column override</div>
              {string.Join("", rows)}
            </div>
            """;
    }

    private static string SourceColumnOptions(SourceTableInfo? sourceTable, string selectedSource)
    {
        if (sourceTable is null)
            return string.Empty;

        var hasSelectedSource = string.IsNullOrWhiteSpace(selectedSource)
            || sourceTable.FindColumn(selectedSource) is not null;
        var missingSourceOption = hasSelectedSource
            ? string.Empty
            : $"""<option value="{Attr(selectedSource)}" selected>Missing source column: {Encode(selectedSource)}</option>""";

        return string.Join(
            "",
            sourceTable.Columns
                .OrderBy(column => column.Ordinal)
                .Select(column => $"""<option value="{Attr(column.Name)}" data-category="{Attr(GetSourceTypeCategory(column) ?? "unknown")}"{Selected(selectedSource, column.Name)}>{Encode(column.Name)} ({Encode(column.DataType)})</option>"""))
            + missingSourceOption;
    }

    private static string NormalizeTransform(string? transform)
    {
        return transform is "convert" or "json_stringify" ? transform : string.Empty;
    }

    private static string? BuildTypeWarning(SourceColumnInfo? sourceColumn, TargetColumnInfo targetColumn, string transform)
    {
        if (transform == "json_stringify")
            return "Will serialize the selected source value to JSON text.";

        if (transform == "convert")
            return "Will explicitly convert the selected source value to the target type.";

        var targetCategory = GetTargetTypeCategory(targetColumn);
        var sourceCategory = sourceColumn is null ? null : GetSourceTypeCategory(sourceColumn);
        if (targetCategory == "json-string")
            return "Target looks like stringified JSON; choose Stringify JSON unless the source already stores JSON text.";

        if (sourceCategory is null || targetCategory is null || AreTypeCategoriesCompatible(sourceCategory, targetCategory))
            return null;

        return $"Type mismatch: source is {sourceCategory}, target expects {targetCategory}. Choose Convert to target type if this is intentional.";
    }

    private static string? GetTargetTypeCategory(TargetColumnInfo targetColumn)
    {
        if (IsJsonStringTarget(targetColumn))
            return "json-string";

        var type = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;
        if (type == typeof(string))
            return "string";
        if (type == typeof(Guid))
            return "uuid";
        if (type == typeof(bool))
            return "boolean";
        if (type == typeof(DateTime) || type == typeof(DateOnly))
            return "date/time";
        if (type.IsEnum)
            return "enum";
        if (type == typeof(byte) || type == typeof(short) || type == typeof(int) || type == typeof(long)
            || type == typeof(float) || type == typeof(double) || type == typeof(decimal))
            return "number";

        return null;
    }

    private static string? GetSourceTypeCategory(SourceColumnInfo sourceColumn)
    {
        var dataType = sourceColumn.DataType.ToLowerInvariant();
        var udtName = sourceColumn.UdtName.ToLowerInvariant();

        if (dataType is "json" or "jsonb" || udtName is "json" or "jsonb")
            return "json";
        if (dataType.Contains("char", StringComparison.Ordinal) || dataType is "text" or "citext" || udtName is "varchar" or "text")
            return "string";
        if (dataType.Contains("int", StringComparison.Ordinal) || dataType is "numeric" or "decimal" or "real" or "double precision" or "money")
            return "number";
        if (dataType is "boolean" || udtName == "bool")
            return "boolean";
        if (dataType == "uuid" || udtName == "uuid")
            return "uuid";
        if (dataType.Contains("date", StringComparison.Ordinal) || dataType.Contains("time", StringComparison.Ordinal))
            return "date/time";

        return null;
    }

    private static bool AreTypeCategoriesCompatible(string sourceCategory, string targetCategory)
    {
        if (sourceCategory == targetCategory)
            return true;

        return targetCategory == "string" && sourceCategory == "json";
    }

    private static bool IsJsonStringTarget(TargetColumnInfo targetColumn)
    {
        var type = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;
        return type == typeof(string)
            && (targetColumn.Name.EndsWith("_json", StringComparison.OrdinalIgnoreCase)
                || targetColumn.Name is "raw_json" or "payload_json");
    }

    private static string MappingEditorScript(string sourceColumnsJson, string relatedTablesJson)
    {
        return """
            <script>
            (() => {
              const sourceColumns = __SOURCE_COLUMNS__;
              const relatedTables = __RELATED_TABLES__;

              const hasOptionValue = (select, value) =>
                Array.from(select.options).some(option => option.value.toLowerCase() === value.toLowerCase());

              const setSecondaryTableOptions = (select, primarySourceKey, selectedValue) => {
                select.replaceChildren();

                const primaryOption = document.createElement("option");
                primaryOption.value = "";
                primaryOption.textContent = "Primary source table";
                primaryOption.selected = !selectedValue;
                select.appendChild(primaryOption);

                for (const table of relatedTables[primarySourceKey] || []) {
                  const option = document.createElement("option");
                  option.value = table.key;
                  option.textContent = table.label;
                  option.selected = selectedValue && table.key.toLowerCase() === selectedValue.toLowerCase();
                  select.appendChild(option);
                }

                if (selectedValue && !hasOptionValue(select, selectedValue)) {
                  const missingOption = document.createElement("option");
                  missingOption.value = selectedValue;
                  missingOption.textContent = `Missing or unrelated source: ${selectedValue}`;
                  missingOption.selected = true;
                  select.appendChild(missingOption);
                }
              };

              const setColumnOptions = (select, sourceKey, selectedValue) => {
                const autoLabel = select.dataset.autoLabel || "Auto";
                select.replaceChildren();

                const autoOption = document.createElement("option");
                autoOption.value = "";
                autoOption.textContent = autoLabel;
                autoOption.selected = !selectedValue;
                select.appendChild(autoOption);

                for (const column of sourceColumns[sourceKey] || []) {
                  const option = document.createElement("option");
                  option.value = column.name;
                  option.textContent = column.label;
                  option.dataset.category = column.category || "unknown";
                  option.selected = selectedValue && column.name.toLowerCase() === selectedValue.toLowerCase();
                  select.appendChild(option);
                }

                if (selectedValue && !hasOptionValue(select, selectedValue)) {
                  const missingOption = document.createElement("option");
                  missingOption.value = selectedValue;
                  missingOption.textContent = `Missing source column: ${selectedValue}`;
                  missingOption.dataset.category = "unknown";
                  missingOption.selected = true;
                  select.appendChild(missingOption);
                }
              };

              const compatible = (sourceCategory, targetCategory) => {
                if (!sourceCategory || !targetCategory || sourceCategory === "unknown" || targetCategory === "unknown") return true;
                if (sourceCategory === targetCategory) return true;
                return targetCategory === "string" && sourceCategory === "json";
              };

              const warningText = (sourceCategory, targetCategory, transform) => {
                if (transform === "json_stringify") return "Will serialize the selected source value to JSON text.";
                if (transform === "convert") return "Will explicitly convert the selected source value to the target type.";
                if (targetCategory === "json-string") return "Target looks like stringified JSON; choose Stringify JSON unless the source already stores JSON text.";
                if (!compatible(sourceCategory, targetCategory)) return `Type mismatch: source is ${sourceCategory}, target expects ${targetCategory}. Choose Convert to target type if this is intentional.`;
                return "";
              };

              const updateWarning = (card, key) => {
                const columnSelect = card.querySelector(`[data-source-column-key="${key}"]`);
                const transformSelect = card.querySelector(`[data-transform-key="${key}"]`);
                if (!columnSelect || !transformSelect) return;

                const warning = transformSelect.closest("div")?.querySelector("[data-type-warning]");
                if (!warning) return;

                const selectedOption = columnSelect.selectedOptions[0];
                const text = warningText(selectedOption?.dataset.category || "", columnSelect.dataset.targetCategory || "", transformSelect.value || "");
                warning.textContent = text;
                warning.hidden = !text;
              };

              const resolveCardSourceKey = (card, cardSourceSelect) => cardSourceSelect.value || card.dataset.autoSourceKey || "";

              for (const cardSourceSelect of document.querySelectorAll("[data-source-table-select]")) {
                const card = cardSourceSelect.closest("[data-target-card]");
                if (!card) continue;

                const refreshColumn = (columnSourceTableSelect, preserveSelection) => {
                  const key = columnSourceTableSelect.dataset.columnKey || "";
                  const columnSelect = card.querySelector(`[data-source-column-key="${key}"]`);
                  if (!columnSelect) return;

                  const sourceKey = columnSourceTableSelect.value || resolveCardSourceKey(card, cardSourceSelect);
                  const selectedValue = preserveSelection ? columnSelect.dataset.selectedSource || "" : "";
                  if (!preserveSelection) columnSelect.dataset.selectedSource = "";
                  setColumnOptions(columnSelect, sourceKey, selectedValue);
                  updateWarning(card, key);
                };

                const refreshSecondaryTables = (preserveSelection) => {
                  const primarySourceKey = resolveCardSourceKey(card, cardSourceSelect);
                  for (const columnSourceTableSelect of card.querySelectorAll("[data-column-source-table-select]")) {
                    const selectedValue = preserveSelection
                      ? columnSourceTableSelect.dataset.selectedSourceTable || columnSourceTableSelect.value || ""
                      : "";
                    if (!preserveSelection) columnSourceTableSelect.dataset.selectedSourceTable = "";
                    setSecondaryTableOptions(columnSourceTableSelect, primarySourceKey, selectedValue);
                    refreshColumn(columnSourceTableSelect, preserveSelection);
                  }
                };

                for (const columnSourceTableSelect of card.querySelectorAll("[data-column-source-table-select]")) {
                  columnSourceTableSelect.addEventListener("change", () => {
                    columnSourceTableSelect.dataset.selectedSourceTable = columnSourceTableSelect.value || "";
                    refreshColumn(columnSourceTableSelect, false);
                  });
                }
                refreshSecondaryTables(true);

                for (const columnSelect of card.querySelectorAll("[data-source-column-select]")) {
                  columnSelect.addEventListener("change", () => {
                    columnSelect.dataset.selectedSource = columnSelect.value || "";
                    updateWarning(card, columnSelect.dataset.sourceColumnKey || "");
                  });
                }

                for (const transformSelect of card.querySelectorAll("[data-transform-select]")) {
                  transformSelect.addEventListener("change", () => updateWarning(card, transformSelect.dataset.transformKey || ""));
                }

                cardSourceSelect.addEventListener("change", () => refreshSecondaryTables(false));
              }
            })();
            </script>
            """
            .Replace("__SOURCE_COLUMNS__", sourceColumnsJson, StringComparison.Ordinal)
            .Replace("__RELATED_TABLES__", relatedTablesJson, StringComparison.Ordinal);
    }
}
