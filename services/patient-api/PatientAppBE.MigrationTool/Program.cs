using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using PatientAppBE.MigrationTool.Models;
using PatientAppBE.MigrationTool.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddUserSecrets<Program>(optional: true)
    .AddEnvironmentVariables();

builder.Services.Configure<MigrationToolOptions>(options =>
{
    options.SourceConnection = FirstConfigured(
        builder.Configuration["PATIENTAPP_MIGRATION_SOURCE_CONNECTION"],
        builder.Configuration.GetConnectionString("Source"),
        builder.Configuration["Migration:SourceConnection"]);

    options.TargetConnection = FirstConfigured(
        builder.Configuration["PATIENTAPP_MIGRATION_TARGET_CONNECTION"],
        builder.Configuration.GetConnectionString("Target"),
        builder.Configuration["Migration:TargetConnection"]);

    options.AdminKey = FirstConfigured(
        builder.Configuration["PATIENTAPP_MIGRATION_ADMIN_KEY"],
        builder.Configuration["Migration:AdminKey"]);

    options.ReportDirectory = FirstConfigured(
        builder.Configuration["PATIENTAPP_MIGRATION_REPORT_DIR"],
        builder.Configuration["Migration:ReportDirectory"]);
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.ValueCountLimit = 32768;
});

builder.Services.AddSingleton<MigrationState>();
builder.Services.AddSingleton<ReportStore>();
builder.Services.AddSingleton<MappingConfigurationStore>();
builder.Services.AddSingleton<TargetSchemaReader>();
builder.Services.AddSingleton<MappingEngine>();
builder.Services.AddScoped<PgSchemaInspector>();
builder.Services.AddScoped<MigrationRunner>();

var app = builder.Build();

app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? string.Empty;
    if (path is "/login" or "/style.css")
    {
        await next(context);
        return;
    }

    var options = context.RequestServices.GetRequiredService<IOptions<MigrationToolOptions>>().Value;
    if (string.IsNullOrWhiteSpace(options.AdminKey))
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(HtmlPages.Error("PATIENTAPP_MIGRATION_ADMIN_KEY is not configured."));
        return;
    }

    if (context.Request.Cookies.TryGetValue("patientapp_migration_auth", out var cookie)
        && CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(cookie),
            Encoding.UTF8.GetBytes(Hash(options.AdminKey))))
    {
        await next(context);
        return;
    }

    context.Response.Redirect("/login");
});

app.MapGet("/style.css", () => Results.Text(HtmlPages.Styles(), "text/css"));

app.MapGet("/login", () => Results.Content(HtmlPages.Login(), "text/html"));

app.MapPost("/login", async (HttpContext context, IOptions<MigrationToolOptions> optionsAccessor) =>
{
    var form = await context.Request.ReadFormAsync();
    var submitted = form["adminKey"].ToString();
    var expected = optionsAccessor.Value.AdminKey;

    if (string.IsNullOrWhiteSpace(expected))
        return Results.Content(HtmlPages.Login("Admin key is not configured."), "text/html");

    if (!CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(submitted),
            Encoding.UTF8.GetBytes(expected)))
    {
        return Results.Content(HtmlPages.Login("Invalid admin key."), "text/html");
    }

    context.Response.Cookies.Append("patientapp_migration_auth", Hash(expected), new CookieOptions
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        Secure = context.Request.IsHttps,
        Expires = DateTimeOffset.UtcNow.AddHours(8),
    });

    return Results.Redirect("/");
});

app.MapPost("/logout", (HttpContext context) =>
{
    context.Response.Cookies.Delete("patientapp_migration_auth");
    return Results.Redirect("/login");
});

app.MapGet("/", (MigrationState state, IOptions<MigrationToolOptions> optionsAccessor) =>
{
    var configured = IsConfigured(optionsAccessor.Value);
    return Results.Content(HtmlPages.Dashboard(state.LatestReport, configured), "text/html");
});

app.MapPost("/check", async (MigrationRunner runner, CancellationToken cancellationToken) =>
{
    var report = await runner.CheckAsync(cancellationToken);
    return Results.Content(HtmlPages.Report(report), "text/html");
});

app.MapPost("/scan", async (MigrationRunner runner, CancellationToken cancellationToken) =>
{
    var report = await runner.ScanAsync(cancellationToken);
    return Results.Content(HtmlPages.Report(report), "text/html");
});

app.MapGet("/mapping", async (
    HttpContext context,
    PgSchemaInspector inspector,
    TargetSchemaReader targetSchemaReader,
    MappingEngine mappingEngine,
    MappingConfigurationStore mappingStore,
    CancellationToken cancellationToken) =>
{
    var targetSchema = targetSchemaReader.Read();
    var sourceSchema = await inspector.ReadSourceSchemaAsync(cancellationToken);
    var configuration = mappingStore.Load();
    var plan = mappingEngine.Build(sourceSchema, targetSchema, configuration);
    var message = context.Request.Query.ContainsKey("saved")
        ? "Mapping configuration saved. Dry-run and apply will use these overrides."
        : context.Request.Query.ContainsKey("reset")
            ? "Saved mapping overrides were reset."
            : null;

    return Results.Content(
        HtmlPages.MappingEditor(sourceSchema, targetSchema, plan, configuration, mappingStore.Path, message),
        "text/html");
});

app.MapPost("/mapping/save", async (
    HttpContext context,
    PgSchemaInspector inspector,
    MappingConfigurationStore mappingStore,
    CancellationToken cancellationToken) =>
{
    var form = await context.Request.ReadFormAsync(cancellationToken);
    MigrationMappingConfiguration configuration;
    try
    {
        var sourceSchema = await inspector.ReadSourceSchemaAsync(cancellationToken);
        configuration = BuildMappingConfiguration(form, mappingStore.Load(), sourceSchema);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Content(HtmlPages.Error(ex.Message), "text/html");
    }

    await mappingStore.SaveAsync(configuration, cancellationToken);
    return Results.Redirect("/mapping?saved=1");
});

app.MapPost("/mapping/reset", async (
    MappingConfigurationStore mappingStore,
    CancellationToken cancellationToken) =>
{
    await mappingStore.SaveAsync(new MigrationMappingConfiguration(), cancellationToken);
    return Results.Redirect("/mapping?reset=1");
});

app.MapPost("/dry-run", async (MigrationRunner runner, CancellationToken cancellationToken) =>
{
    var report = await runner.DryRunAsync(cancellationToken);
    return Results.Content(HtmlPages.Report(report), "text/html");
});

app.MapPost("/apply", async (HttpContext context, MigrationRunner runner, CancellationToken cancellationToken) =>
{
    var form = await context.Request.ReadFormAsync(cancellationToken);
    if (form["confirmation"].ToString() != "APPLY")
        return Results.Content(HtmlPages.Error("Apply requires typing APPLY exactly."), "text/html");

    var report = await runner.ApplyAsync(cancellationToken);
    return Results.Content(HtmlPages.Report(report), "text/html");
});

app.MapGet("/report", (MigrationState state) =>
{
    var report = state.LatestReport;
    return report is null
        ? Results.Content(HtmlPages.Error("No report exists yet."), "text/html")
        : Results.Content(HtmlPages.Report(report), "text/html");
});

app.MapGet("/export/html", (MigrationState state) =>
{
    var report = state.LatestReport;
    return report is null
        ? Results.NotFound("No report exists yet.")
        : Results.Text(HtmlPages.Report(report), "text/html");
});

app.MapGet("/export/json", (MigrationState state, ReportStore store) =>
{
    var report = state.LatestReport;
    return report is null
        ? Results.NotFound("No report exists yet.")
        : Results.Text(store.BuildJson(report), "application/json");
});

app.MapGet("/export/tables.csv", (MigrationState state, ReportStore store) =>
{
    var report = state.LatestReport;
    return report is null
        ? Results.NotFound("No report exists yet.")
        : Results.Text(store.BuildTableCsv(report), "text/csv");
});

app.MapGet("/export/trash.csv", (MigrationState state, ReportStore store) =>
{
    var report = state.LatestReport;
    return report is null
        ? Results.NotFound("No report exists yet.")
        : Results.Text(store.BuildTrashCsv(report), "text/csv");
});

app.Run();

static string FirstConfigured(params string?[] values)
{
    return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
}

static bool IsConfigured(MigrationToolOptions options)
{
    return !string.IsNullOrWhiteSpace(options.SourceConnection)
        && !string.IsNullOrWhiteSpace(options.TargetConnection)
        && !string.IsNullOrWhiteSpace(options.AdminKey);
}

static string Hash(string value)
{
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
    return Convert.ToHexString(bytes);
}

static MigrationMappingConfiguration BuildMappingConfiguration(
    IFormCollection form,
    MigrationMappingConfiguration? existingConfiguration = null,
    DatabaseSchema? sourceSchema = null)
{
    return form["mappingMode"].ToString() == "target-first"
        ? BuildTargetFirstMappingConfiguration(form, existingConfiguration, sourceSchema)
        : BuildSourceFirstMappingConfiguration(form);
}

static MigrationMappingConfiguration BuildTargetFirstMappingConfiguration(
    IFormCollection form,
    MigrationMappingConfiguration? existingConfiguration,
    DatabaseSchema? sourceSchema)
{
    var configuration = new MigrationMappingConfiguration();
    var sourceTargets = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    var targetCount = int.TryParse(form["targetCount"].ToString(), out var parsedCount) ? parsedCount : 0;

    for (var targetIndex = 0; targetIndex < targetCount; targetIndex++)
    {
        var targetTable = form[$"targetTableName_{targetIndex}"].ToString();
        if (string.IsNullOrWhiteSpace(targetTable))
            continue;

        var selectedSourceTable = form[$"sourceTableKey_{targetIndex}"].ToString();
        var autoSourceTable = form[$"autoSourceTableKey_{targetIndex}"].ToString();
        if (selectedSourceTable == "__none__")
        {
            if (!string.IsNullOrWhiteSpace(autoSourceTable))
            {
                EnsureSourceTableIsUsedOnce(sourceTargets, autoSourceTable, targetTable);
                configuration.Tables[autoSourceTable] = new TableMappingOverride
                {
                    ForceUnmapped = true,
                };
            }

            continue;
        }

        var sourceTable = string.IsNullOrWhiteSpace(selectedSourceTable)
            ? autoSourceTable
            : selectedSourceTable;
        if (string.IsNullOrWhiteSpace(sourceTable))
            continue;
        EnsureSourceTableExists(sourceSchema, sourceTable, targetTable);

        var tableOverride = new TableMappingOverride
        {
            TargetTableName = targetTable,
        };
        var columnCount = int.TryParse(form[$"columnCount_{targetIndex}"].ToString(), out var parsedColumnCount)
            ? parsedColumnCount
            : 0;

        for (var columnIndex = 0; columnIndex < columnCount; columnIndex++)
        {
            var targetColumn = form[$"targetColumn_{targetIndex}_{columnIndex}"].ToString();
            var sourceTableForColumn = form[$"sourceTableForColumn_{targetIndex}_{columnIndex}"].ToString();
            var sourceColumn = form[$"sourceColumn_{targetIndex}_{columnIndex}"].ToString();
            var transform = NormalizeColumnTransform(form[$"transform_{targetIndex}_{columnIndex}"].ToString());
            if (string.IsNullOrWhiteSpace(targetColumn) || string.IsNullOrWhiteSpace(sourceColumn))
                continue;

            var normalizedSourceTableForColumn = NormalizeSecondarySourceTable(
                sourceSchema,
                sourceTable,
                sourceTableForColumn,
                targetTable,
                targetColumn);
            EnsureSourceColumnExists(
                sourceSchema,
                normalizedSourceTableForColumn ?? sourceTable,
                sourceColumn,
                targetTable,
                targetColumn);

            tableOverride.ColumnSources[targetColumn] = new ColumnMappingOverride
            {
                SourceTableKey = normalizedSourceTableForColumn,
                SourceColumnName = sourceColumn,
                Transform = transform,
            };
        }

        var hasExplicitSourceTable = !string.IsNullOrWhiteSpace(selectedSourceTable);
        if (!hasExplicitSourceTable && tableOverride.Columns.Count == 0 && tableOverride.ColumnSources.Count == 0)
            continue;

        EnsureSourceTableIsUsedOnce(sourceTargets, sourceTable, targetTable);
        configuration.Tables[sourceTable] = tableOverride;
    }

    if (existingConfiguration is not null)
    {
        foreach (var existingTable in existingConfiguration.Tables)
        {
            if (configuration.Tables.ContainsKey(existingTable.Key))
                continue;

            if (existingTable.Value.Trash || existingTable.Value.ForceUnmapped)
                configuration.Tables[existingTable.Key] = existingTable.Value;
        }
    }

    return configuration;
}

static MigrationMappingConfiguration BuildSourceFirstMappingConfiguration(IFormCollection form)
{
    var configuration = new MigrationMappingConfiguration();
    var tableCount = int.TryParse(form["tableCount"].ToString(), out var parsedCount) ? parsedCount : 0;

    for (var tableIndex = 0; tableIndex < tableCount; tableIndex++)
    {
        var sourceTableKey = form[$"sourceTableKey_{tableIndex}"].ToString();
        if (string.IsNullOrWhiteSpace(sourceTableKey))
            continue;

        var tableOverride = new TableMappingOverride();
        var targetTable = form[$"targetTable_{tableIndex}"].ToString();
        if (targetTable == "__trash__")
        {
            tableOverride.Trash = true;
        }
        else if (targetTable == "__unmapped__")
        {
            tableOverride.ForceUnmapped = true;
        }
        else if (!string.IsNullOrWhiteSpace(targetTable))
        {
            tableOverride.TargetTableName = targetTable;
        }

        var columnCount = int.TryParse(form[$"columnCount_{tableIndex}"].ToString(), out var parsedColumnCount)
            ? parsedColumnCount
            : 0;

        for (var columnIndex = 0; columnIndex < columnCount; columnIndex++)
        {
            var targetColumn = form[$"targetColumn_{tableIndex}_{columnIndex}"].ToString();
            var sourceColumn = form[$"sourceColumn_{tableIndex}_{columnIndex}"].ToString();
            if (string.IsNullOrWhiteSpace(targetColumn) || string.IsNullOrWhiteSpace(sourceColumn))
                continue;

            tableOverride.Columns[targetColumn] = sourceColumn;
        }

        if (tableOverride.Trash
            || tableOverride.ForceUnmapped
            || !string.IsNullOrWhiteSpace(tableOverride.TargetTableName)
            || tableOverride.Columns.Count > 0)
        {
            configuration.Tables[sourceTableKey] = tableOverride;
        }
    }

    return configuration;
}

static void EnsureSourceTableIsUsedOnce(Dictionary<string, string> sourceTargets, string sourceTable, string targetTable)
{
    if (sourceTargets.TryGetValue(sourceTable, out var existingTarget)
        && !string.Equals(existingTarget, targetTable, StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            $"Source table {sourceTable} is already mapped to target table {existingTarget}. Choose one target table for each source table.");
    }

    sourceTargets[sourceTable] = targetTable;
}

static void EnsureSourceTableExists(DatabaseSchema? sourceSchema, string sourceTableKey, string targetTable)
{
    if (sourceSchema is null || sourceSchema.FindTable(sourceTableKey) is not null)
        return;

    throw new InvalidOperationException(
        $"Source table {sourceTableKey} selected for target table {targetTable} no longer exists in the source database.");
}

static string? NormalizeSecondarySourceTable(
    DatabaseSchema? sourceSchema,
    string primarySourceTableKey,
    string secondarySourceTableKey,
    string targetTable,
    string targetColumn)
{
    if (string.IsNullOrWhiteSpace(secondarySourceTableKey)
        || string.Equals(secondarySourceTableKey, primarySourceTableKey, StringComparison.OrdinalIgnoreCase))
    {
        return null;
    }

    EnsureSecondarySourceTableIsRelated(
        sourceSchema,
        primarySourceTableKey,
        secondarySourceTableKey,
        targetTable,
        targetColumn);
    return secondarySourceTableKey;
}

static void EnsureSecondarySourceTableIsRelated(
    DatabaseSchema? sourceSchema,
    string primarySourceTableKey,
    string secondarySourceTableKey,
    string targetTable,
    string targetColumn)
{
    if (sourceSchema is null)
        return;

    var primarySourceTable = sourceSchema.FindTable(primarySourceTableKey)
        ?? throw new InvalidOperationException(
            $"Primary source table {primarySourceTableKey} selected for target table {targetTable} no longer exists in the source database.");
    var secondarySourceTable = sourceSchema.FindTable(secondarySourceTableKey)
        ?? throw new InvalidOperationException(
            $"Secondary source table {secondarySourceTableKey} selected for target column {targetTable}.{targetColumn} no longer exists in the source database.");
    var related = primarySourceTable.ForeignKeys.Any(fk =>
            string.Equals(fk.ReferencedKey, secondarySourceTable.Key, StringComparison.OrdinalIgnoreCase))
        || secondarySourceTable.ForeignKeys.Any(fk =>
            string.Equals(fk.ReferencedKey, primarySourceTable.Key, StringComparison.OrdinalIgnoreCase));

    if (!related)
    {
        throw new InvalidOperationException(
            $"Secondary source table {secondarySourceTable.Key} for target column {targetTable}.{targetColumn} must be connected to primary source table {primarySourceTable.Key} by source FK metadata.");
    }
}

static void EnsureSourceColumnExists(
    DatabaseSchema? sourceSchema,
    string sourceTableKey,
    string sourceColumnName,
    string targetTable,
    string targetColumn)
{
    if (sourceSchema is null)
        return;

    var sourceTable = sourceSchema.FindTable(sourceTableKey)
        ?? throw new InvalidOperationException(
            $"Source table {sourceTableKey} selected for target column {targetTable}.{targetColumn} no longer exists in the source database.");
    if (sourceTable.FindColumn(sourceColumnName) is not null)
        return;

    throw new InvalidOperationException(
        $"Source column {sourceTableKey}.{sourceColumnName} selected for target column {targetTable}.{targetColumn} does not exist. Choose a column from the selected source table.");
}

static string? NormalizeColumnTransform(string? transform)
{
    return transform is "convert" or "json_stringify" ? transform : null;
}

public partial class Program;
