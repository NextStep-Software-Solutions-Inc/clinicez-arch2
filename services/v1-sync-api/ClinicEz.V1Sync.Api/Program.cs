using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.V1Sync.Api.Auth;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using ClinicEz.V1Sync.Api.Services.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true);
builder.Configuration.AddEnvironmentVariables();

// Clerk JWT authentication (matching portal-api) when Clerk:Authority is configured
var clerkAuthority = builder.Configuration["Clerk:Authority"];
if (!string.IsNullOrWhiteSpace(clerkAuthority))
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = clerkAuthority;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                NameClaimType = ClaimTypes.NameIdentifier,
                ValidateAudience = false
            };
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    var authorizedParties = builder.Configuration.GetAuthorizedParties("Clerk:AuthorizedParties");
                    if (authorizedParties is { Length: > 0 })
                    {
                        var azp = context.Principal?.FindFirstValue("azp");
                        var ok = !string.IsNullOrEmpty(azp) && authorizedParties.Any(party =>
                            party == azp ||
                            (party.Contains('*') && Regex.IsMatch(
                                azp,
                                "^" + Regex.Escape(party).Replace("\\*", ".*") + "$",
                                RegexOptions.IgnoreCase)));
                        if (!ok) context.Fail("AZP claim is invalid or missing.");
                    }
                    return Task.CompletedTask;
                }
            };
        });
}

builder.Services.AddAuthorization();
builder.Services.AddHttpClient("PortalAdminAuth", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(_ => true)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }
        else
        {
            var authorizedParties = builder.Configuration.GetAuthorizedParties("Clerk:AuthorizedParties");
            var allowedOrigins = builder.Configuration.GetStringList("Cors:AllowedOrigins");
            var allowedDomains = builder.Configuration.GetStringList("Cors:AllowedDomains");
            var baseDomain = builder.Configuration["Facility:BaseDomain"];
            var combinedPatterns = authorizedParties
                .Concat(allowedOrigins)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            policy.SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrWhiteSpace(origin)) return false;
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                var host = uri.Host;
                if (!string.IsNullOrWhiteSpace(baseDomain))
                {
                    var cleanBase = baseDomain.Trim().TrimStart('.');
                    if (host.Equals(cleanBase, StringComparison.OrdinalIgnoreCase) ||
                        host.EndsWith("." + cleanBase, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }

                foreach (var domain in allowedDomains)
                {
                    var cleanDomain = domain.Trim().TrimStart('.');
                    if (cleanDomain.Length == 0) continue;
                    if (host.Equals(cleanDomain, StringComparison.OrdinalIgnoreCase) ||
                        host.EndsWith("." + cleanDomain, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }

                return combinedPatterns.Any(pattern =>
                {
                    if (string.Equals(pattern, origin, StringComparison.OrdinalIgnoreCase))
                        return true;
                    if (pattern.Contains('*'))
                    {
                        var regex = "^" + Regex.Escape(pattern).Replace("\\*", ".*") + "$";
                        return Regex.IsMatch(origin, regex, RegexOptions.IgnoreCase);
                    }
                    return false;
                });
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
        }
    });
});

builder.Services.Configure<Track3StorageOptions>(opts =>
{
    builder.Configuration.GetSection(Track3StorageOptions.SectionName).Bind(opts);

    static void ApplyBucketFallbacks(Track3BucketOptions target, IConfiguration cfg, string planeSection)
    {
        static string? FirstNonEmpty(params string?[] candidates) =>
            candidates.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

        target.ServiceUrl = FirstNonEmpty(target.ServiceUrl, cfg[$"{planeSection}:ServiceUrl"], cfg["S3:ServiceUrl"]);
        target.AccountId = FirstNonEmpty(target.AccountId, cfg[$"{planeSection}:AccountId"], cfg["R2:AccountId"]);
        target.BucketName = FirstNonEmpty(target.BucketName, cfg[$"{planeSection}:BucketName"], cfg["R2:BucketName"]) ?? string.Empty;
        target.AccessKeyId = FirstNonEmpty(target.AccessKeyId, cfg[$"{planeSection}:AccessKeyId"], cfg["R2:AccessKeyId"]) ?? string.Empty;
        target.SecretAccessKey = FirstNonEmpty(target.SecretAccessKey, cfg[$"{planeSection}:SecretAccessKey"], cfg["R2:SecretAccessKey"]) ?? string.Empty;
    }

    ApplyBucketFallbacks(opts.ClinicR2, builder.Configuration, "ClinicR2");
    ApplyBucketFallbacks(opts.PatientR2, builder.Configuration, "PatientR2");
});
builder.Services.AddHttpClient(LegacyBlobSourceDownloader.HttpClientName, client =>
{
    client.Timeout = TimeSpan.FromSeconds(45);
})
.RemoveAllLoggers()
.ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    AllowAutoRedirect = false,
    PooledConnectionLifetime = TimeSpan.FromMinutes(5)
});

builder.Services.AddSingleton<SyncConnectionFactory>();
builder.Services.AddSingleton<SyncLedgerRepository>();
builder.Services.AddSingleton<SyncRuntimeSettingsService>();
builder.Services.AddSingleton<ScopedCdcIdResolver>();
builder.Services.AddSingleton<V1CatalogService>();
builder.Services.AddSingleton<PatientIdentityDirectoryService>();
builder.Services.AddSingleton<Track1ClinicSyncEngine>();
builder.Services.AddSingleton<Track2PatientSyncEngine>();
builder.Services.AddSingleton<Track3EnvelopeEncryptor>();
builder.Services.AddSingleton<Track3R2ClientPool>();
builder.Services.AddSingleton(sp => ActivatorUtilities.CreateInstance<LegacyBlobSourceDownloader>(sp));
builder.Services.AddSingleton<Track3StorageSyncEngine>();
builder.Services.AddSingleton<SyncCoordinator>();
builder.Services.AddSingleton<V1SyncAdminGuard>();
builder.Services.AddSingleton<V1SyncCdcWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<V1SyncCdcWorker>());

var app = builder.Build();

// Bootstrap Sync Ledger schema & DB-backed runtime settings cleanly on startup if configured
var connections = app.Services.GetRequiredService<SyncConnectionFactory>();
if (connections.HasSyncLedgerDb)
{
    var ledger = app.Services.GetRequiredService<SyncLedgerRepository>();
    await ledger.EnsureSchemaAsync();
    var runtimeSettings = app.Services.GetRequiredService<SyncRuntimeSettingsService>();
    await runtimeSettings.InitializeAsync();
}

app.UseCors();
if (!string.IsNullOrWhiteSpace(clerkAuthority))
{
    app.UseAuthentication();
    app.UseAuthorization();
}

app.MapGet("/health", () => Results.Ok(new
{
    service = "v1-sync-api",
    status = "healthy",
    utc = DateTimeOffset.UtcNow
}));

// Admin-protected endpoint group (`/api/v1/v1-sync/*`)
var group = app.MapGroup("/api/v1/v1-sync")
    .AddEndpointFilter(async (ctx, next) =>
    {
        var guard = ctx.HttpContext.RequestServices.GetRequiredService<V1SyncAdminGuard>();
        var decision = await guard.AuthorizeAsync(ctx.HttpContext, ctx.HttpContext.RequestAborted);
        if (!decision.Allowed)
        {
            return Results.Json(new { message = decision.Error ?? "Unauthorized" }, statusCode: decision.StatusCode);
        }
        ctx.HttpContext.Items["V1SyncActor"] = decision.Actor;
        try
        {
            return await next(ctx);
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.Conflict(new { message = ex.Message });
        }
        catch (Npgsql.NpgsqlException ex)
        {
            return Results.Json(
                new { message = $"Database temporarily unavailable ({SyncTransforms.SanitizeErrorMessage(ex)})." },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (TimeoutException ex)
        {
            return Results.Json(
                new { message = $"Operation timed out ({SyncTransforms.SanitizeErrorMessage(ex)})." },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    });

static string ActorOf(HttpContext ctx) =>
    ctx.Items.TryGetValue("V1SyncActor", out var v) && v is string s && !string.IsNullOrWhiteSpace(s)
        ? s
        : "platform-admin";

group.MapGet("/status", async (
    SyncConnectionFactory connFactory,
    SyncLedgerRepository ledger,
    SyncRuntimeSettingsService runtimeSettings,
    V1SyncCdcWorker worker,
    Track3R2ClientPool r2Pool,
    Track3EnvelopeEncryptor encryptor,
    Track3StorageSyncEngine storageEngine,
    CancellationToken ct) =>
{
    var dbProbeTask = connFactory.ProbeHealthAsync(ct);
    var r2ProbeTask = r2Pool.ProbeHealthAsync(ct);
    await Task.WhenAll(dbProbeTask, r2ProbeTask);
    var probe = dbProbeTask.Result;
    var r2Health = r2ProbeTask.Result;

    var liveSettings = probe.LedgerOk
        ? await runtimeSettings.RefreshAsync(ct)
        : runtimeSettings.Current;

    Track3StorageCounts storageCounts;
    if (probe.ClinicOk || probe.PatientOk)
    {
        using var countsCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        countsCts.CancelAfter(TimeSpan.FromSeconds(4));
        storageCounts = await storageEngine.ProbeStorageCountsAsync(countsCts.Token);
    }
    else
    {
        storageCounts = new Track3StorageCounts(0, 0, 0, 0, 0, 0);
    }

    var activeBindings = 0;
    var openConflicts = 0;
    if (probe.LedgerOk)
    {
        var bindings = await ledger.ListBindingsAsync(ct);
        activeBindings = bindings.Count(b => !b.IsFrozen);
        openConflicts = await ledger.CountOpenConflictsAsync(null, ct);
    }

    return Results.Ok(new SyncSystemStatusResponse(
        EnvironmentLabel: liveSettings.EnvironmentLabel,
        V1SourceConnected: probe.V1Ok,
        ClinicDbConnected: probe.ClinicOk,
        PatientDbConnected: probe.PatientOk,
        SyncLedgerConnected: probe.LedgerOk,
        V1SyncTriggersInstalled: probe.TriggersOk,
        V1SyncTriggerTableCount: probe.TriggerTables,
        V1ChangelogMaxSeq: probe.MaxSeq,
        BackgroundWorkerEnabled: liveSettings.EnableBackgroundWorker,
        WorkerLastHeartbeatUtc: worker.LastHeartbeatUtc,
        ActiveBindingsCount: activeBindings,
        OpenConflictsCount: openConflicts,
        ClinicR2Connected: r2Health.ClinicR2Ok,
        PatientR2Connected: r2Health.PatientR2Ok,
        ClinicEncryptionConfigured: encryptor.IsClinicConfigured,
        PatientEncryptionConfigured: encryptor.IsPatientConfigured,
        AzureBlob1Configured: liveSettings.StorageEnabled && liveSettings.AzureBlob1Enabled,
        ClinicPendingStorageCount: storageCounts.ClinicPending,
        PatientPendingStorageCount: storageCounts.PatientPending,
        ClinicTotalStorageCount: storageCounts.ClinicTotal,
        PatientTotalStorageCount: storageCounts.PatientTotal,
        ClinicSkippedStorageCount: storageCounts.ClinicSkipped,
        PatientSkippedStorageCount: storageCounts.PatientSkipped
    ));
});

group.MapGet("/settings", async (
    SyncRuntimeSettingsService runtimeSettings,
    Track3R2ClientPool r2Pool,
    Track3EnvelopeEncryptor encryptor,
    CancellationToken ct) =>
{
    var response = await runtimeSettings.GetResponseAsync(r2Pool, encryptor, ct);
    return Results.Ok(response);
});

group.MapPatch("/settings", async (
    UpdateSyncRuntimeSettingsRequest req,
    SyncRuntimeSettingsService runtimeSettings,
    Track3R2ClientPool r2Pool,
    Track3EnvelopeEncryptor encryptor,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var updated = await runtimeSettings.UpdateAsync(req, ActorOf(ctx), r2Pool, encryptor, ct);
    return Results.Ok(updated);
});

group.MapGet("/v1-catalog", async (V1CatalogService catalog, CancellationToken ct) =>
{
    var res = await catalog.GetCatalogAsync(ct);
    return Results.Ok(res);
});

group.MapGet("/mapping-guide", () => Results.Ok(V1SyncMappingGuideCatalog.Build()));

static string ReadEmbeddedSqlScript(string resourceName)
{
    var assembly = typeof(Program).Assembly;
    using var stream = assembly.GetManifestResourceStream(resourceName)
        ?? throw new InvalidOperationException($"Embedded SQL script '{resourceName}' was not found.");
    using var reader = new System.IO.StreamReader(stream);
    return reader.ReadToEnd();
}

group.MapGet("/tracking-scripts", () =>
{
    var installSql = ReadEmbeddedSqlScript("ClinicEz.V1Sync.Api.Sql.01_install_v1_sync_changelog.sql");
    var uninstallSql = ReadEmbeddedSqlScript("ClinicEz.V1Sync.Api.Sql.02_uninstall_v1_sync_changelog.sql");

    return Results.Ok(new TrackingSqlScriptsResponse(
        Install: new TrackingSqlScriptItem(
            FileName: "01_install_v1_sync_changelog.sql",
            Title: "Enable Live Change Tracking",
            Description: "Run once on your Classic Clinic EZ (v1) PostgreSQL database to track updates across 65 tables. Safe to re-run and makes zero changes to existing tables.",
            Sql: installSql
        ),
        Uninstall: new TrackingSqlScriptItem(
            FileName: "02_uninstall_v1_sync_changelog.sql",
            Title: "Remove Live Change Tracking",
            Description: "Run once on your Classic Clinic EZ (v1) PostgreSQL database after retiring v1 to remove all tracking triggers and the temporary tracking schema.",
            Sql: uninstallSql
        )
    ));
});

async Task<IResult> ListV2ClinicsAsync(SyncConnectionFactory connFactory, CancellationToken ct)
{
    if (!connFactory.HasClinicDb)
    {
        return Results.Ok(Array.Empty<V2ClinicOption>());
    }

    try
    {
        await using var conn = await connFactory.OpenClinicDbAsync(ct);
        const string sql = """
            SELECT "ClinicId", "ClinicName", "TenantId", "TenantSlug", "FacilitySlug"
            FROM public."Settings"
            WHERE "IsDeleted" = false
            ORDER BY "ClinicName" ASC, "CreatedAt" ASC
            """;
        var items = new List<V2ClinicOption>();
        await using var cmd = new Npgsql.NpgsqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            items.Add(new V2ClinicOption(
                Id: r.GetGuid(0),
                Name: r.GetString(1),
                TenantId: r.GetString(2),
                TenantSlug: r.IsDBNull(3) ? null : r.GetString(3),
                FacilitySlug: r.IsDBNull(4) ? null : r.GetString(4)
            ));
        }
        return Results.Ok(items);
    }
    catch (Npgsql.PostgresException ex) when (ex.SqlState == "42P01")
    {
        return Results.Ok(Array.Empty<V2ClinicOption>());
    }
}

group.MapGet("/clinics", ListV2ClinicsAsync);
group.MapGet("/tenants", ListV2ClinicsAsync);

group.MapGet("/bindings", async (SyncLedgerRepository ledger, CancellationToken ct) =>
    Results.Ok(await ledger.ListBindingsAsync(ct)));

group.MapPost("/bindings", async (
    CreateBindingRequest req,
    SyncLedgerRepository ledger,
    SyncRuntimeSettingsService runtimeSettings,
    HttpContext ctx,
    CancellationToken ct) =>
{
    if (req.Track is not (SyncTrack.Track1Clinic or SyncTrack.Track2Patient or SyncTrack.Track3Storage))
    {
        return Results.BadRequest(new { message = "Track must be TRACK1_CLINIC, TRACK2_PATIENT, or TRACK3_STORAGE." });
    }
    if (string.IsNullOrWhiteSpace(req.Name))
    {
        return Results.BadRequest(new { message = "Binding name is required." });
    }
    if (req.Track == SyncTrack.Track1Clinic &&
        (!req.V1ClinicId.HasValue || string.IsNullOrWhiteSpace(req.V2TenantId) || !req.V2ClinicId.HasValue))
    {
        return Results.BadRequest(new { message = "Track 1 bindings require explicit V1ClinicId, V2TenantId, and V2ClinicId." });
    }

    var defaults = runtimeSettings.Current;
    var resolvedReq = req with
    {
        PollIntervalSeconds = req.PollIntervalSeconds ?? defaults.DefaultPollIntervalSeconds,
        BatchSize = req.BatchSize ?? defaults.DefaultBatchSize
    };

    var created = await ledger.CreateBindingAsync(resolvedReq, ActorOf(ctx), ct);
    return Results.Created($"/api/v1/v1-sync/bindings/{created.Id}", created);
});

group.MapPatch("/bindings/{id:guid}", async (
    Guid id,
    UpdateBindingRequest req,
    SyncLedgerRepository ledger,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var outcome = await ledger.UpdateBindingWithGuardAsync(id, req, ActorOf(ctx), ct);
    return outcome.StatusCode switch
    {
        200 => Results.Ok(outcome.Value),
        400 => Results.BadRequest(new { message = outcome.ErrorMessage }),
        404 => Results.NotFound(new { message = outcome.ErrorMessage }),
        409 => Results.Conflict(new { message = outcome.ErrorMessage }),
        _ => Results.Problem(outcome.ErrorMessage, statusCode: outcome.StatusCode)
    };
});

group.MapDelete("/bindings/{id:guid}", async (
    Guid id,
    bool? force,
    SyncLedgerRepository ledger,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var outcome = await ledger.DeleteBindingAsync(id, force ?? false, ActorOf(ctx), ct);
    return outcome.StatusCode switch
    {
        200 => Results.Ok(outcome.Value),
        404 => Results.NotFound(new { message = outcome.ErrorMessage }),
        409 => Results.Conflict(new { message = outcome.ErrorMessage }),
        _ => Results.Problem(outcome.ErrorMessage, statusCode: outcome.StatusCode)
    };
});

group.MapPost("/bindings/{id:guid}/dry-run", async (
    Guid id,
    bool? asyncMode,
    RunSyncRequest? req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    if (asyncMode == true)
    {
        var started = await coord.StartBackgroundImportAsync(id, SyncRunMode.DryRun, req?.SampleLimit, false, req?.BatchSize, ActorOf(ctx), ct, req);
        return Results.Accepted($"/api/v1/v1-sync/bindings/{id}/runs", started);
    }
    var run = await coord.ExecuteAsync(id, SyncRunMode.DryRun, req?.SampleLimit, false, ActorOf(ctx), ct, req?.BatchSize, req);
    return Results.Ok(run);
});

group.MapPost("/bindings/{id:guid}/backfill", async (
    Guid id,
    bool? asyncMode,
    RunSyncRequest? req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    if (asyncMode == true)
    {
        var started = await coord.StartBackgroundImportAsync(id, SyncRunMode.Backfill, req?.SampleLimit, req?.ForceV1OnConflict ?? false, req?.BatchSize, ActorOf(ctx), ct, req);
        return Results.Accepted($"/api/v1/v1-sync/bindings/{id}/runs", started);
    }
    var run = await coord.ExecuteAsync(id, SyncRunMode.Backfill, req?.SampleLimit, req?.ForceV1OnConflict ?? false, ActorOf(ctx), ct, req?.BatchSize, req);
    return Results.Ok(run);
});

group.MapPost("/bindings/{id:guid}/pull-now", async (
    Guid id,
    RunSyncRequest? req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var run = await coord.ExecuteAsync(id, SyncRunMode.Incremental, null, req?.ForceV1OnConflict ?? false, ActorOf(ctx), ct, req?.BatchSize, req);
    return Results.Ok(run);
});

group.MapPost("/bindings/{id:guid}/final-sweep", async (
    Guid id,
    bool? asyncMode,
    RunSyncRequest? req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    // Final Decommission Drain & Full Parity Sweep — NEVER auto-freezes!
    if (asyncMode == true)
    {
        var started = await coord.StartBackgroundImportAsync(id, SyncRunMode.FinalSweep, null, false, req?.BatchSize, ActorOf(ctx), ct, req);
        return Results.Accepted($"/api/v1/v1-sync/bindings/{id}/runs", new { run = started });
    }
    var run = await coord.ExecuteAsync(id, SyncRunMode.FinalSweep, null, false, ActorOf(ctx), ct, req?.BatchSize, req);
    var parity = await coord.GetParityReportAsync(id, ct);
    return Results.Ok(new { run, parity });
});

group.MapGet("/bindings/{id:guid}/storage-objects", async (
    Guid id,
    string? status,
    string? provider,
    string? plane,
    int? limit,
    int? offset,
    SyncLedgerRepository ledger,
    CancellationToken ct) =>
{
    var binding = await ledger.GetBindingAsync(id, ct);
    if (binding is null)
    {
        return Results.NotFound(new { message = $"Sync binding '{id}' was not found." });
    }
    var result = await ledger.ListStorageObjectsAsync(id, status, provider, plane, limit ?? 50, offset ?? 0, ct);
    return Results.Ok(result);
});

group.MapPost("/bindings/{id:guid}/retry-failed", async (
    Guid id,
    bool? asyncMode,
    bool? includeAuthSkipped,
    RunSyncRequest? req,
    SyncLedgerRepository ledger,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var binding = await ledger.GetBindingAsync(id, ct);
    if (binding is null)
    {
        return Results.NotFound(new { message = $"Sync binding '{id}' was not found." });
    }
    if (binding.Track != SyncTrack.Track3Storage)
    {
        return Results.BadRequest(new { message = "retry-failed is only supported for TRACK3_STORAGE bindings." });
    }
    if (binding.IsFrozen)
    {
        return Results.Conflict(new { message = $"Binding '{binding.Name}' is manually frozen (decommissioned)." });
    }

    var effectiveReq = (req ?? new RunSyncRequest()) with { RetryFailedOnly = true };
    if (asyncMode == true)
    {
        var started = await coord.StartBackgroundImportAsync(
            id, SyncRunMode.Backfill, effectiveReq.SampleLimit, false, effectiveReq.BatchSize, ActorOf(ctx), ct, effectiveReq,
            requeueFailed: true, includeAuthSkipped: includeAuthSkipped ?? false);
        return Results.Accepted($"/api/v1/v1-sync/bindings/{id}/runs", started);
    }

    var run = await coord.ExecuteAsync(
        id, SyncRunMode.Backfill, effectiveReq.SampleLimit, false, ActorOf(ctx), ct, effectiveReq.BatchSize, effectiveReq,
        requeueFailed: true, includeAuthSkipped: includeAuthSkipped ?? false);
    return Results.Ok(run);
});

group.MapGet("/bindings/{id:guid}/parity", async (
    Guid id,
    SyncCoordinator coord,
    CancellationToken ct) =>
{
    var parity = await coord.GetParityReportAsync(id, ct);
    return Results.Ok(parity);
});

group.MapPost("/bindings/{id:guid}/freeze", async (
    Guid id,
    FreezeBindingRequest req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    if (!string.Equals(req.ConfirmationToken?.Trim(), "FREEZE", StringComparison.Ordinal))
    {
        return Results.BadRequest(new { message = "Explicit confirmation token 'FREEZE' is required for manual decommission freeze." });
    }

    var frozen = await coord.FreezeBindingAsync(id, ActorOf(ctx), req.Reason, ct);
    if (frozen is null) return Results.NotFound();

    return Results.Ok(new FreezeBindingResponse(
        Binding: frozen,
        UninstallSqlHint: "services/v1-sync-api/sql/02_uninstall_v1_sync_changelog.sql"
    ));
});

group.MapPost("/bindings/{id:guid}/unfreeze", async (
    Guid id,
    SyncLedgerRepository ledger,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var unfrozen = await ledger.UnfreezeBindingAsync(id, ActorOf(ctx), ct);
    return unfrozen is null ? Results.NotFound() : Results.Ok(unfrozen);
});

group.MapGet("/bindings/{id:guid}/runs", async (
    Guid id,
    int? limit,
    string? mode,
    SyncLedgerRepository ledger,
    CancellationToken ct) =>
    Results.Ok(await ledger.ListRunsAsync(id, limit ?? 25, ct, mode)));

group.MapGet("/runs/{runId:guid}/diffs", async (
    Guid runId,
    int? limit,
    int? offset,
    SyncLedgerRepository ledger,
    CancellationToken ct) =>
{
    var resolvedLimit = Math.Clamp(limit ?? 200, 1, 1000);
    var resolvedOffset = Math.Max(0, offset ?? 0);
    var (items, total) = await ledger.ListRunDiffsAsync(runId, resolvedLimit, resolvedOffset, ct);
    return Results.Ok(new PaginatedSyncResponse<SyncChangeDiffRecord>(items, total, resolvedLimit, resolvedOffset));
});

group.MapGet("/bindings/{id:guid}/diffs", async (
    Guid id,
    int? limit,
    int? offset,
    SyncLedgerRepository ledger,
    CancellationToken ct) =>
{
    var resolvedLimit = Math.Clamp(limit ?? 200, 1, 1000);
    var resolvedOffset = Math.Max(0, offset ?? 0);
    var (items, total) = await ledger.ListBindingDiffsAsync(id, resolvedLimit, resolvedOffset, ct);
    return Results.Ok(new PaginatedSyncResponse<SyncChangeDiffRecord>(items, total, resolvedLimit, resolvedOffset));
});

group.MapGet("/bindings/{id:guid}/conflicts", async (
    Guid id,
    string? status,
    int? limit,
    int? offset,
    SyncLedgerRepository ledger,
    CancellationToken ct) =>
{
    var resolvedLimit = Math.Clamp(limit ?? 100, 1, 500);
    var resolvedOffset = Math.Max(0, offset ?? 0);
    var (items, total) = await ledger.ListConflictsAsync(id, status, resolvedLimit, resolvedOffset, ct);
    return Results.Ok(new PaginatedSyncResponse<SyncConflictRecord>(items, total, resolvedLimit, resolvedOffset));
});

group.MapPost("/conflicts/{conflictId:guid}/resolve", async (
    Guid conflictId,
    ResolveConflictRequest req,
    SyncCoordinator coord,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var normRes = req.Resolution?.Trim().ToUpperInvariant();
    if (normRes is not ("KEEP_V2" or "FORCE_V1" or "IGNORE"))
    {
        return Results.BadRequest(new { message = "Resolution must be KEEP_V2, FORCE_V1, or IGNORE." });
    }

    var actor = !string.IsNullOrWhiteSpace(req.ResolvedBy)
        ? req.ResolvedBy.Trim()
        : ActorOf(ctx);

    var resolved = await coord.ResolveConflictAsync(conflictId, normRes, actor, ct);
    return resolved is null ? Results.NotFound() : Results.Ok(resolved);
});

group.MapGet("/patient-identities", async (
    string? search,
    string? status,
    int? limit,
    int? offset,
    PatientIdentityDirectoryService directory,
    CancellationToken ct) =>
{
    var result = await directory.ListAsync(search, status, limit ?? 25, offset ?? 0, ct);
    return Results.Ok(result);
});

group.MapPost("/patient-identities/{patientId:guid}/bind-clerk", async (
    Guid patientId,
    BindClerkIdentityRequest req,
    PatientIdentityDirectoryService directory,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var result = await directory.ReconcileClerkAsync(patientId, req, ActorOf(ctx), ct);
    return Results.Ok(result);
});

app.Run();

public partial class Program { }
