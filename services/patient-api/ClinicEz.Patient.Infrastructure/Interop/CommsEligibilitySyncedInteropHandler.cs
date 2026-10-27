using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>comms.eligibility.synced</c>: facility communications engine synchronized an eligibility grant
/// for a patient or managed dependent.
/// </summary>
public sealed class CommsEligibilitySyncedInteropHandler : IInteropHandler<CommsEligibilitySyncedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly ILogger<CommsEligibilitySyncedInteropHandler> _logger;

    public CommsEligibilitySyncedInteropHandler(
        ApplicationDbContext dbContext,
        ISyncNotificationService syncNotificationService,
        ILogger<CommsEligibilitySyncedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _syncNotificationService = syncNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsEligibilitySyncedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var existing = await _dbContext.PatientEligibilityGrants
            .FirstOrDefaultAsync(g => g.GrantId == message.GrantId, ct);

        if (existing != null)
        {
            if (message.Version <= existing.Version)
            {
                _logger.LogInformation("Eligibility grant {GrantId} already at or past version {Version}. Skipping.",
                    message.GrantId, existing.Version);
                return;
            }

            existing.IsActive = message.IsActive;
            existing.WindowEndUtc = message.WindowEndUtc;
            existing.ExpiresAtUtc = message.WindowEndUtc;
            existing.Version = message.Version;
            existing.SyncedAtUtc = DateTime.UtcNow;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            var facilityName = "Facility";
            if (Guid.TryParse(message.FacilityId, out var fId))
            {
                var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == fId, ct);
                if (clinic != null && !string.IsNullOrWhiteSpace(clinic.Name))
                {
                    facilityName = clinic.Name;
                }
            }

            var newGrant = new PatientEligibilityGrant
            {
                GrantId = message.GrantId,
                PatientId = message.PatientId,
                TenantId = message.TenantId,
                FacilityId = message.FacilityId,
                FacilityType = message.FacilityType,
                FacilityName = facilityName,
                ContextType = message.ContextType,
                ContextId = message.ContextId,
                IsActive = message.IsActive,
                WindowEndUtc = message.WindowEndUtc,
                ExpiresAtUtc = message.WindowEndUtc,
                Version = message.Version,
                SyncedAtUtc = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };

            await _dbContext.PatientEligibilityGrants.AddAsync(newGrant, ct);
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Synchronized EligibilityGrant {GrantId} for Patient {PatientId} at Facility {FacilityId} (Active: {IsActive}).",
            message.GrantId, message.PatientId, message.FacilityId, message.IsActive);

        try
        {
            await _syncNotificationService.NotifyCommsEventAsync(
                message.PatientId,
                "EligibilitySynced",
                new
                {
                    grantId = message.GrantId,
                    facilityId = message.FacilityId,
                    facilityType = message.FacilityType,
                    isActive = message.IsActive,
                    windowEndUtc = message.WindowEndUtc
                },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast eligibility sync for patient {PatientId}.", message.PatientId);
        }
    }
}
