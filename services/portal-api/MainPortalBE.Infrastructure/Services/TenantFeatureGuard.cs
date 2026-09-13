using System;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Constants;
using Microsoft.EntityFrameworkCore;
using MainPortalBE.Infrastructure.Persistence;

namespace MainPortalBE.Infrastructure.Services;

public class TenantFeatureGuard(ApplicationDbContext context) : ITenantFeatureGuard
{
    public async Task EnsureCanCreateClinicAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantId, cancellationToken) 
            ?? throw new Exception("Tenant not found");

        var limits = PlanFeaturesConfig.GetLimitsForPlan(tenant.SubscriptionPlanId);
        
        // TODO: Count actual clinics once the Clinic entity is established in the domain
        var currentClinicCount = 1; 

        if (currentClinicCount >= limits.MaxClinics)
        {
            throw new Exception($"Feature Limit Reached: Your current plan only allows up to {limits.MaxClinics} clinics. Please upgrade your subscription.");
        }
    }

    public async Task EnsureCanCreateStaffAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantId, cancellationToken) 
            ?? throw new Exception("Tenant not found");

        var limits = PlanFeaturesConfig.GetLimitsForPlan(tenant.SubscriptionPlanId);
        
        // TODO: Count actual staff members
        var currentStaffCount = 0; 

        if (currentStaffCount >= limits.MaxStaff)
        {
            throw new Exception($"Feature Limit Reached: Your current plan only allows up to {limits.MaxStaff} staff members. Please upgrade your subscription.");
        }
    }

    public async Task EnsureCanCreatePatientAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantId, cancellationToken) 
            ?? throw new Exception("Tenant not found");

        var limits = PlanFeaturesConfig.GetLimitsForPlan(tenant.SubscriptionPlanId);
        
        // TODO: Count actual patients
        var currentPatientCount = 0; 

        if (currentPatientCount >= limits.MaxPatients)
        {
            throw new Exception($"Feature Limit Reached: Your current plan only allows up to {limits.MaxPatients} patients. Please upgrade your subscription.");
        }
    }
}
