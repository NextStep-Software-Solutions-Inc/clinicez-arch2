using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using PatientApp.MigrationTool.Models;
using PatientApp.MigrationTool.Services;

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

builder.Services.AddSingleton<MigrationState>();
builder.Services.AddSingleton<ReportStore>();
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

public partial class Program;

