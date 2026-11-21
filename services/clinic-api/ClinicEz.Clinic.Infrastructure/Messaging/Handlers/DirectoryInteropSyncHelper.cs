using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Handlers;

internal static class DirectoryInteropSyncHelper
{
    public static bool IsAuthorizedPortalSender(InteropMessageContext context, ILogger logger, string messageType)
    {
        var isAuthorized = context.From.Kind == PartyKind.ControlPlane &&
            string.Equals(InteropServices.For(context.From), InteropServices.Portal, StringComparison.OrdinalIgnoreCase);

        if (!isAuthorized)
        {
            logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring {MessageType} {MessageId}: sender {Sender} is not authorized portal control plane.",
                messageType, context.MessageId, context.From.Address);
        }

        return isAuthorized;
    }

    public static async Task<FacilitySettings?> ResolveAddressedClinicSettingsAsync(
        ApplicationDbContext dbContext,
        InteropMessageContext context,
        Guid? payloadFacilityId,
        string? payloadTenantId,
        ILogger logger,
        string messageType,
        CancellationToken ct)
    {
        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var addressedFacilityId)
            || (payloadFacilityId.HasValue && addressedFacilityId != payloadFacilityId.Value)
            || (!string.IsNullOrWhiteSpace(payloadTenantId) && !string.Equals(to.TenantId, payloadTenantId, StringComparison.OrdinalIgnoreCase)))
        {
            logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring {MessageType} {MessageId}: addressed to {To}, mismatching payload facility {FacilityId} / tenant {TenantId}.",
                messageType, context.MessageId, to.Address, payloadFacilityId, payloadTenantId);
            return null;
        }

        var normalizedTenant = to.TenantId.Trim().ToLower();
        var settings = await dbContext.Settings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == addressedFacilityId && s.TenantId.ToLower() == normalizedTenant, ct);

        if (settings == null)
        {
            logger.LogWarning(
                "[ClinicEz.Clinic] ClinicSettings not found for clinic {ClinicId} (Tenant: {TenantId}) on {MessageType} {MessageId}.",
                addressedFacilityId, to.TenantId, messageType, context.MessageId);
        }

        return settings;
    }

    public static async Task EnqueueDirectorySnapshotIfVerifiedAndPublishedAsync(
        ApplicationDbContext dbContext,
        IInteropPublisher publisher,
        FacilitySettings settings,
        CancellationToken ct)
    {
        if (settings.PlatformVerificationStatus != PlatformVerificationStatus.Verified || !settings.IsDirectoryPublished)
        {
            return;
        }

        var clinicians = await dbContext.StaffMembers
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == settings.ClinicId
                        && !s.IsDeleted
                        && s.IsActive
                        && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToListAsync(ct);

        var services = await dbContext.ServiceItems
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == settings.ClinicId && !s.IsDeleted && s.IsActive)
            .OrderBy(s => s.Name)
            .ToListAsync(ct);

        var optedInIds = clinicians
            .Where(s => s.IsDirectoryOptIn)
            .Select(s => s.Id)
            .ToHashSet();

        var schedules = optedInIds.Count > 0
            ? await dbContext.DoctorScheduleTemplates
                .IgnoreQueryFilters()
                .Where(t => t.ClinicId == settings.ClinicId
                            && !t.IsDeleted
                            && t.IsActive
                            && optedInIds.Contains(t.DoctorId))
                .OrderBy(t => t.DayOfWeek)
                .ThenBy(t => t.StartTime)
                .ToListAsync(ct)
            : [];

        var directoryEvent = ClinicDirectorySnapshotBuilder.BuildFacilityDirectoryEvent(
            settings,
            clinicians,
            services,
            schedules);

        var from = ClinicParties.Clinic(settings.TenantId, settings.ClinicId.ToString());
        var to = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        publisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            from,
            to,
            settings.ClinicId,
            directoryEvent);
    }
}
