using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.BackgroundServices;

public sealed class EodReconciliationBackgroundService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceProvider _services;
    private readonly ILogger<EodReconciliationBackgroundService> _logger;

    public EodReconciliationBackgroundService(
        IServiceProvider services,
        ILogger<EodReconciliationBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("EOD Reconciliation Background Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunReconciliationCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in EOD reconciliation background cycle.");
            }

            try
            {
                await Task.Delay(CheckInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    public async Task RunReconciliationCycleAsync(CancellationToken ct = default)
    {
        List<ClinicSettings> clinics;
        using (var initialScope = _services.CreateScope())
        {
            var db = initialScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            clinics = await db.ClinicSettings
                .IgnoreQueryFilters()
                .Where(c => !c.IsDeleted && c.AutoEodEnabled && !string.IsNullOrEmpty(c.EodReconciliationTime))
                .AsNoTracking()
                .ToListAsync(ct);
        }

        var utcNow = DateTime.UtcNow;

        foreach (var clinic in clinics)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                using var clinicScope = _services.CreateScope();
                var workspaceProfiles = clinicScope.ServiceProvider.GetService<IWorkspaceProfileProvider>();
                await CheckAndReconcileClinicAsync(clinicScope.ServiceProvider, clinic, workspaceProfiles, utcNow, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed automated EOD reconciliation check for clinic {ClinicId} ({ClinicName}).",
                    clinic.ClinicId, clinic.ClinicName);
            }
        }
    }

    public static bool ShouldReconcile(
        ClinicSettings clinic,
        string? timeZoneId,
        DateTime utcNow,
        out DateOnly localToday)
    {
        localToday = default;

        if (!clinic.AutoEodEnabled || string.IsNullOrWhiteSpace(clinic.EodReconciliationTime))
            return false;

        if (!TimeOnly.TryParse(clinic.EodReconciliationTime.Trim(), out var eodTargetTime))
            return false;

        var tz = ResolveTimeZone(timeZoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);
        var localTime = TimeOnly.FromDateTime(localNow);
        localToday = DateOnly.FromDateTime(localNow);

        return localTime >= eodTargetTime;
    }

    public static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        if (!string.IsNullOrWhiteSpace(timeZoneId))
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId.Trim());
            }
            catch
            {
                // Fallback to standard
            }
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone("PST", TimeSpan.FromHours(8), "Philippine Standard Time", "Philippine Standard Time");
            }
        }
    }

    private async Task CheckAndReconcileClinicAsync(
        IServiceProvider scopedProvider,
        ClinicSettings clinic,
        IWorkspaceProfileProvider? workspaceProfiles,
        DateTime utcNow,
        CancellationToken ct)
    {
        string? tzId = !string.IsNullOrWhiteSpace(clinic.TimeZoneId)
            ? clinic.TimeZoneId.Trim()
            : null;

        if (string.IsNullOrWhiteSpace(tzId) && workspaceProfiles != null)
        {
            try
            {
                var profile = await workspaceProfiles.GetAsync(clinic.TenantId, ct);
                tzId = profile?.TimeZoneId;
            }
            catch
            {
                tzId = null;
            }
        }

        if (!ShouldReconcile(clinic, tzId, utcNow, out var localToday))
            return;

        var db = scopedProvider.GetRequiredService<ApplicationDbContext>();

        // Check if an audit record already exists for this clinic on localToday
        var alreadyReconciled = await db.Set<EodReconciliationAudit>()
            .IgnoreQueryFilters()
            .AnyAsync(a => a.ClinicId == clinic.ClinicId && a.ReconciliationDate == localToday, ct);

        if (alreadyReconciled)
            return;

        // Enter clinic scope
        var scopeSetter = scopedProvider.GetRequiredService<IClinicScopeSetter>();
        scopeSetter.Enter(clinic.TenantId, clinic.ClinicId);

        var sender = scopedProvider.GetRequiredService<ISender>();
        var command = new ReconcileEodCommand(
            Date: localToday,
            TriggerType: "Automatic",
            Reason: $"Scheduled automated EOD reconciliation at {clinic.EodReconciliationTime} ({ResolveTimeZone(tzId).Id}).");

        var result = await sender.Send(command, ct);
        _logger.LogInformation(
            "Automated EOD completed for clinic {ClinicId} on {Date}: {Summary}",
            clinic.ClinicId, localToday, result.Summary);
    }
}
