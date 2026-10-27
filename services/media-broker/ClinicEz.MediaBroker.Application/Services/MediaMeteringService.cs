using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.MediaBroker.Application.Services;

public sealed class MediaMeteringService : IMediaMeteringService
{
    private readonly IMediaBrokerDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<MediaMeteringService> _logger;

    public MediaMeteringService(
        IMediaBrokerDbContext db,
        IInteropPublisher publisher,
        ILogger<MediaMeteringService> logger)
    {
        _db = db;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task<CallAdmissionDecision> EvaluateCallAdmissionAsync(string tenantId, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        var entitlement = await _db.Entitlements
            .FirstOrDefaultAsync(e => e.TenantId == tenantId, ct);

        if (entitlement == null || !entitlement.IsActive)
        {
            return new CallAdmissionDecision(
                Allowed: false,
                Reason: "Tenant teleconsultation entitlement is inactive.",
                IsOverdraft: false);
        }

        if (entitlement.CallMinutesMonthly <= 0)
        {
            return new CallAdmissionDecision(
                Allowed: false,
                Reason: "Teleconsultation minute pool not provisioned on active plan.",
                IsOverdraft: false);
        }

        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");
        var usage = await _db.MonthlyUsages
            .FirstOrDefaultAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth, ct);

        var minutesUsed = usage?.MinutesUsed ?? 0;

        if (minutesUsed >= entitlement.CallMinutesMonthly)
        {
            if (!entitlement.AllowOverdraft)
            {
                return new CallAdmissionDecision(
                    Allowed: false,
                    Reason: "Monthly teleconsultation minute pool exhausted.",
                    IsOverdraft: false);
            }

            return new CallAdmissionDecision(
                Allowed: true,
                Reason: null,
                IsOverdraft: true);
        }

        return new CallAdmissionDecision(
            Allowed: true,
            Reason: null,
            IsOverdraft: false);
    }

    public async Task RecordCallEndedAsync(Guid callId, DateTime startedAtUtc, DateTime endedAtUtc, CancellationToken ct = default)
    {
        var session = await _db.CallSessions
            .FirstOrDefaultAsync(s => s.CallId == callId, ct);

        if (session == null)
        {
            _logger.LogWarning("[MediaMeteringService] Call session {CallId} not found to record completion.", callId);
            return;
        }

        var duration = (int)Math.Max(1, Math.Ceiling((endedAtUtc - startedAtUtc).TotalMinutes));
        var yearMonth = startedAtUtc.ToString("yyyy-MM");

        var entitlement = await _db.Entitlements
            .FirstOrDefaultAsync(e => e.TenantId == session.TenantId, ct);

        var usage = await _db.MonthlyUsages
            .FirstOrDefaultAsync(u => u.TenantId == session.TenantId && u.YearMonth == yearMonth, ct);

        if (usage == null)
        {
            usage = new TenantMonthlyUsage
            {
                TenantId = session.TenantId,
                YearMonth = yearMonth,
                MinutesUsed = 0,
                MinutesOverdraft = 0,
                TotalCallsCompleted = 0,
                LastRecordedAtUtc = DateTime.UtcNow
            };
            _db.MonthlyUsages.Add(usage);
        }

        var monthlyLimit = entitlement?.CallMinutesMonthly ?? 0;
        var remainingPool = Math.Max(0, monthlyLimit - usage.MinutesUsed);
        var poolMinutes = Math.Min(remainingPool, duration);
        var overdraftMinutes = duration - poolMinutes;

        // Running call cutoff protection: Call was never severed mid-flight, excess minutes logged to overdraft
        usage.MinutesUsed += poolMinutes;
        usage.MinutesOverdraft += overdraftMinutes;
        usage.TotalCallsCompleted++;
        usage.LastRecordedAtUtc = DateTime.UtcNow;

        session.Status = "Ended";
        session.StartedAtUtc = startedAtUtc;
        session.EndedAtUtc = endedAtUtc;
        session.DurationMinutes = duration;
        session.BillableMinutes = duration;
        session.IsOverdraft = overdraftMinutes > 0;

        _db.AuditLogs.Add(new MediaAuditLog
        {
            TenantId = session.TenantId,
            CallId = session.CallId,
            EventType = "CallEnded",
            Details = $"Call completed. Duration: {duration} mins (Pool: {poolMinutes}m, Overdraft: {overdraftMinutes}m).",
            TimestampUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);

        // Report usage strictly to Party.Portal
        _publisher.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            session.CallId,
            new MediaUsageRecordedPayload(
                CallId: session.CallId,
                TenantId: session.TenantId,
                DurationMinutes: duration,
                CallStartedAtUtc: startedAtUtc,
                CallEndedAtUtc: endedAtUtc
            )
        );

        _logger.LogInformation("[MediaMeteringService] Reported {Duration} call minutes for tenant {TenantId} to Party.Portal.",
            duration, session.TenantId);
    }
}
