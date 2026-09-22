using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Portal.Infrastructure.Persistence;

namespace ClinicEz.Portal.Infrastructure.Services;

public class TenantFeatureGuard(ApplicationDbContext context) : ITenantFeatureGuard
{
    public async Task EnsureCanCreateFacilityAsync(string tenantId, FacilityType facilityType, CancellationToken cancellationToken = default)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.Id.ToString() == tenantId || t.TenantSlug == tenantId, cancellationToken) 
            ?? throw new InvalidOperationException("Tenant not found");

        var effectivePlanId = tenant.SubscriptionPlanId;
        if (string.IsNullOrEmpty(effectivePlanId) && tenant.SubscriptionStatus == "TRIALING")
        {
            effectivePlanId = "starter";
        }

        // Check if 14-day free trial has expired
        if (tenant.SubscriptionStatus == "TRIALING" && DateTime.UtcNow > tenant.CreatedAt.AddDays(14))
        {
            throw new InvalidOperationException("Your 14-day free trial has expired. Please upgrade to an active subscription plan to continue provisioning facilities.");
        }

        var limits = PlanFeaturesConfig.GetLimitsForPlan(effectivePlanId);
        if (limits == null || tenant.SubscriptionStatus == "EXPIRED")
        {
            throw new InvalidOperationException("Feature Access Restricted: An active plan subscription is required to provision facilities. Please select and activate a subscription plan.");
        }

        if (facilityType == FacilityType.Clinic)
        {
            var currentClinicCount = await context.Facilities.CountAsync(f => 
                f.TenantId == tenant.Id && f.FacilityType == FacilityType.Clinic, cancellationToken);

            if (currentClinicCount >= limits.MaxClinics)
            {
                throw new InvalidOperationException($"Feature Limit Reached: Your current plan ({limits.PlanTitle}) only allows up to {limits.MaxClinics} clinic location{(limits.MaxClinics > 1 ? "s" : "")}. Please upgrade your subscription to add more clinics.");
            }
        }
    }

    public async Task EnsureCanCreateClinicAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        await EnsureCanCreateFacilityAsync(tenantId, FacilityType.Clinic, cancellationToken);
    }

    public async Task EnsureCanCreateStaffAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantId, cancellationToken) 
            ?? throw new Exception("Tenant not found");

        var limits = PlanFeaturesConfig.GetLimitsForPlan(tenant.SubscriptionPlanId);
        if (limits == null)
        {
            throw new Exception("Feature Access Restricted: An active plan subscription is required. Please select and activate a subscription plan.");
        }
        
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
        if (limits == null)
        {
            throw new Exception("Feature Access Restricted: An active plan subscription is required. Please select and activate a subscription plan.");
        }
        
        // TODO: Count actual patients
        var currentPatientCount = 0; 

        if (currentPatientCount >= limits.MaxPatients)
        {
            throw new Exception($"Feature Limit Reached: Your current plan only allows up to {limits.MaxPatients} patients. Please upgrade your subscription.");
        }
    }
}
