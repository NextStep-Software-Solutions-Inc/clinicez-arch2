using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Publishes patient-to-facility communication eligibility grants and revocations
/// to <c>comms-api</c> keyed strictly to the canonical Patient Portal <c>CloudPatientId</c>.
/// </summary>
public interface ICommsEligibilityPublisher
{
    Task EnqueueGrantAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        string contextType,
        string contextId,
        DateTime windowStartUtc,
        DateTime windowEndUtc,
        int version,
        Guid? cloudPatientIdOverride = null,
        CancellationToken ct = default);

    Task EnqueueRevokeAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        string contextType,
        string contextId,
        string reason,
        DateTime revokedAtUtc,
        int version,
        Guid? cloudPatientIdOverride = null,
        CancellationToken ct = default);

    Task SyncActiveEligibilityForLinkedPatientAsync(
        string? tenantId,
        Guid clinicId,
        Guid clinicPatientId,
        Guid cloudPatientId,
        CancellationToken ct = default);
}

/// <summary>
/// Monotonic version helpers for <c>comms.eligibility.granted</c> and <c>comms.eligibility.revoked</c>.
/// Ensures updates and terminal revocations always strictly supersede earlier grants even within the same second.
/// </summary>
public static class CommsEligibilityVersions
{
    public const int Initial = 1;
    private static readonly DateTime EpochUtc = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static int ForUpdate(DateTime? utcNow = null)
    {
        var elapsedSeconds = (long)Math.Floor(((utcNow ?? DateTime.UtcNow) - EpochUtc).TotalSeconds);
        return (int)Math.Clamp(elapsedSeconds, 2L, int.MaxValue - 1L);
    }

    public static int ForRevoke(DateTime? utcNow = null) => ForUpdate(utcNow) + 1;
}

/// <summary>
/// Shared outbox helper used by application command handlers when <see cref="ICommsEligibilityPublisher"/>
/// is not injected (e.g., unit tests passing repositories directly).
/// </summary>
public static class CommsEligibilityOutboxHelper
{
    public static void EnqueueGrant(
        IInteropPublisher publisher,
        string tenantId,
        Guid clinicId,
        Guid cloudPatientId,
        string contextType,
        string contextId,
        DateTime windowStartUtc,
        DateTime windowEndUtc,
        int version)
    {
        if (string.IsNullOrWhiteSpace(tenantId) || clinicId == Guid.Empty || cloudPatientId == Guid.Empty)
        {
            return;
        }

        var facilityId = clinicId.ToString();
        var grantId = CommsGrantIdGenerator.Create(tenantId, facilityId, contextType, contextId);
        var from = Party.ForFacility(tenantId, facilityId, FacilityType.Clinic);
        var to = Party.ForFacility(tenantId, facilityId, FacilityType.Clinic, service: InteropServices.Comms);
        var payload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: tenantId,
            FacilityId: facilityId,
            FacilityType: "Clinic",
            PatientId: cloudPatientId,
            ContextType: contextType,
            ContextId: contextId,
            WindowStartUtc: windowStartUtc,
            WindowEndUtc: windowEndUtc,
            Version: version);

        publisher.Enqueue(InteropTypes.CommsEligibilityGranted, from, to, correlationId: grantId, payload);
    }

    public static void EnqueueRevoke(
        IInteropPublisher publisher,
        string tenantId,
        Guid clinicId,
        Guid cloudPatientId,
        string contextType,
        string contextId,
        string reason,
        DateTime revokedAtUtc,
        int version)
    {
        if (string.IsNullOrWhiteSpace(tenantId) || clinicId == Guid.Empty || cloudPatientId == Guid.Empty)
        {
            return;
        }

        var facilityId = clinicId.ToString();
        var grantId = CommsGrantIdGenerator.Create(tenantId, facilityId, contextType, contextId);
        var from = Party.ForFacility(tenantId, facilityId, FacilityType.Clinic);
        var to = Party.ForFacility(tenantId, facilityId, FacilityType.Clinic, service: InteropServices.Comms);
        var payload = new CommsEligibilityRevokedPayload(
            GrantId: grantId,
            TenantId: tenantId,
            FacilityId: facilityId,
            PatientId: cloudPatientId,
            Reason: reason,
            RevokedAtUtc: revokedAtUtc,
            Version: version);

        publisher.Enqueue(InteropTypes.CommsEligibilityRevoked, from, to, correlationId: grantId, payload);
    }

    public static async Task<Guid?> ResolveCloudPatientIdAsync(
        IRepository<Patient>? patientRepo,
        Guid clinicId,
        Guid clinicPatientId,
        CancellationToken ct)
    {
        if (patientRepo == null || clinicId == Guid.Empty || clinicPatientId == Guid.Empty)
        {
            return null;
        }

        var cloudPatientId = await patientRepo
            .Query(p => !p.IsDeleted && p.ClinicId == clinicId && p.Id == clinicPatientId, ignoreQueryFilters: true)
            .Select(p => p.CloudPatientId)
            .FirstOrDefaultAsync(ct);

        return cloudPatientId is { } id && id != Guid.Empty ? id : null;
    }
}
