using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Resolves each clinic patient's canonical Patient Portal <c>CloudPatientId</c> and publishes
/// <c>comms.eligibility.granted</c> / <c>comms.eligibility.revoked</c> envelopes via the transactional outbox.
/// Walk-in patients without a linked Patient Portal account are skipped safely.
/// </summary>
public sealed class CommsEligibilityPublisher : ICommsEligibilityPublisher
{
    private readonly ApplicationDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<CommsEligibilityPublisher> _logger;

    public CommsEligibilityPublisher(
        ApplicationDbContext db,
        IInteropPublisher publisher,
        ILogger<CommsEligibilityPublisher> logger)
    {
        _db = db;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task EnqueueGrantAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        string contextType,
        string contextId,
        DateTime windowStartUtc,
        DateTime windowEndUtc,
        int version,
        Guid? cloudPatientIdOverride = null,
        CancellationToken ct = default)
    {
        var effectiveTenantId = await ResolveTenantIdAsync(tenantId, clinicId, ct);
        if (string.IsNullOrWhiteSpace(effectiveTenantId))
        {
            _logger.LogDebug(
                "[CommsEligibilityPublisher] Skipping {ContextType}:{ContextId} grant for clinic {ClinicId}: tenant ID is missing.",
                contextType, contextId, clinicId);
            return;
        }

        var cloudPatientId = await ResolveCloudPatientIdAsync(clinicId, clinicPatientId, cloudPatientIdOverride, ct);
        if (!cloudPatientId.HasValue)
        {
            _logger.LogDebug(
                "[CommsEligibilityPublisher] Skipping {ContextType}:{ContextId} grant for clinic patient {ClinicPatientId}: patient has no linked CloudPatientId.",
                contextType, contextId, clinicPatientId);
            return;
        }

        CommsEligibilityOutboxHelper.EnqueueGrant(
            _publisher,
            effectiveTenantId,
            clinicId,
            cloudPatientId.Value,
            contextType,
            contextId,
            windowStartUtc,
            windowEndUtc,
            version);
    }

    public async Task EnqueueRevokeAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        string contextType,
        string contextId,
        string reason,
        DateTime revokedAtUtc,
        int version,
        Guid? cloudPatientIdOverride = null,
        CancellationToken ct = default)
    {
        var effectiveTenantId = await ResolveTenantIdAsync(tenantId, clinicId, ct);
        if (string.IsNullOrWhiteSpace(effectiveTenantId))
        {
            return;
        }

        var cloudPatientId = await ResolveCloudPatientIdAsync(clinicId, clinicPatientId, cloudPatientIdOverride, ct);
        if (!cloudPatientId.HasValue)
        {
            return;
        }

        CommsEligibilityOutboxHelper.EnqueueRevoke(
            _publisher,
            effectiveTenantId,
            clinicId,
            cloudPatientId.Value,
            contextType,
            contextId,
            reason,
            revokedAtUtc,
            version);
    }

    public async Task SyncActiveEligibilityForLinkedPatientAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        Guid cloudPatientId,
        CancellationToken ct = default)
    {
        if (clinicId == Guid.Empty || clinicPatientId == Guid.Empty || cloudPatientId == Guid.Empty)
        {
            return;
        }

        var effectiveTenantId = await ResolveTenantIdAsync(tenantId, clinicId, ct);
        if (string.IsNullOrWhiteSpace(effectiveTenantId))
        {
            return;
        }

        var now = DateTime.UtcNow;
        var recentCutoff = now.AddDays(-7);

        var activeAppointments = await _db.Appointments
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(a =>
                !a.IsDeleted &&
                a.ClinicId == clinicId &&
                a.PatientId == clinicPatientId &&
                (a.Status == AppointmentStatus.Confirmed || a.Status == AppointmentStatus.CheckedIn) &&
                a.ScheduledAt >= recentCutoff)
            .Select(a => new { a.Id, a.ScheduledAt })
            .ToListAsync(ct);

        foreach (var appt in activeAppointments)
        {
            var windowEnd = (appt.ScheduledAt > now ? appt.ScheduledAt : now).AddDays(7);
            CommsEligibilityOutboxHelper.EnqueueGrant(
                _publisher,
                effectiveTenantId,
                clinicId,
                cloudPatientId,
                "Appointment",
                appt.Id.ToString(),
                now,
                windowEnd,
                CommsEligibilityVersions.ForUpdate(now));
        }

        var activeQueueItems = await _db.QueueItems
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(q =>
                !q.IsDeleted &&
                q.ClinicId == clinicId &&
                q.PatientId == clinicPatientId &&
                q.CheckInTime >= recentCutoff &&
                (q.Status == QueueStatus.Waiting ||
                 q.Status == QueueStatus.Triaged ||
                 q.Status == QueueStatus.InConsultation ||
                 q.Status == QueueStatus.PendingProcedure ||
                 q.Status == QueueStatus.ReEvaluation ||
                 q.Status == QueueStatus.OnHold))
            .Select(q => q.Id)
            .ToListAsync(ct);

        foreach (var queueItemId in activeQueueItems)
        {
            CommsEligibilityOutboxHelper.EnqueueGrant(
                _publisher,
                effectiveTenantId,
                clinicId,
                cloudPatientId,
                "QueueVisit",
                queueItemId.ToString(),
                now,
                now.AddDays(7),
                CommsEligibilityVersions.Initial);
        }
    }

    private async Task<string?> ResolveTenantIdAsync(string? tenantId, Guid clinicId, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            return tenantId;
        }

        if (clinicId == Guid.Empty)
        {
            return null;
        }

        return await _db.Settings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => !s.IsDeleted && s.ClinicId == clinicId)
            .Select(s => s.TenantId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> ResolveCloudPatientIdAsync(
        Guid clinicId,
        Guid clinicPatientId,
        Guid? overrideId,
        CancellationToken ct)
    {
        if (overrideId is { } id && id != Guid.Empty)
        {
            return id;
        }

        if (clinicId == Guid.Empty || clinicPatientId == Guid.Empty)
        {
            return null;
        }

        var cloudPatientId = await _db.Patients
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(p => !p.IsDeleted && p.ClinicId == clinicId && p.Id == clinicPatientId)
            .Select(p => p.CloudPatientId)
            .FirstOrDefaultAsync(ct);

        return cloudPatientId is { } resolved && resolved != Guid.Empty ? resolved : null;
    }
}
