using System;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Consumers;

public class FacilityCreatedConsumer : IConsumer<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityCreatedConsumer> _logger;

    public FacilityCreatedConsumer(
        ApplicationDbContext dbContext,
        ILogger<FacilityCreatedConsumer> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
        
        if (message.FacilityType != FacilityType.Pharmacy) 
            return;

        _logger.LogInformation("[ClinicEz.Pharmacy] Provisioning Pharmacy: '{Name}' (ID: {ResourceId}) for Tenant {TenantId}",
            message.Name, message.ResourceId, message.TenantId);

        // Seed or update PharmacySettings with cryptographically rooted license token
        var existingSettings = await _dbContext.PharmacySettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.PharmacyId == message.ResourceId);

        if (existingSettings != null)
        {
            if (!string.IsNullOrWhiteSpace(message.LicenseToken))
            {
                existingSettings.LicenseToken = message.LicenseToken;
                existingSettings.PlanTier = message.PlanTier ?? "Community";
                existingSettings.MaxStaffLimit = message.Limits?.MaxStaff ?? 5;
                existingSettings.LicenseExpiresAt = message.LicenseExpiresAt;
            }
            existingSettings.PharmacyName = message.Name;
        }
        else
        {
            var newSettings = new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = message.TenantId,
                PharmacyId = message.ResourceId,
                PharmacyName = message.Name,
                LicenseToken = message.LicenseToken,
                PlanTier = message.PlanTier ?? "Community",
                MaxStaffLimit = message.Limits?.MaxStaff ?? 5,
                LicenseExpiresAt = message.LicenseExpiresAt,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "SystemProvisioning"
            };
            _dbContext.PharmacySettings.Add(newSettings);
        }

        await _dbContext.SaveChangesAsync();

        // Publish feedback confirmation event
        await context.Publish(new FacilityProvisionedEvent
        {
            ResourceId = message.ResourceId,
            TenantId = message.TenantId,
            Success = true,
            Message = $"Pharmacy dashboard successfully provisioned '{message.Name}'."
        });
    }
}
