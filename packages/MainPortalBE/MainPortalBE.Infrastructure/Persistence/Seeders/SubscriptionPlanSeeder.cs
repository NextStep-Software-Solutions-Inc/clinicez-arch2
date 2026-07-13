using System;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Domain.Entities;
using MainPortalBE.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Infrastructure.Persistence.Seeders;

public class SubscriptionPlanSeeder : IBaseSeeder
{
    private readonly ApplicationDbContext _context;

    public SubscriptionPlanSeeder(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedDate = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc);
        var starterId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var proId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var enterpriseId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        var plans = new[]
        {
            new SubscriptionPlan { Id = starterId, Name = "Starter", Slug = "starter", Description = "Perfect for small individual clinics.", PriceMonthly = 2940, PriceAnnually = 2340, IsHighlighted = false, RequiresCheckout = true, CreatedAt = seedDate },
            new SubscriptionPlan { Id = proId, Name = "Professional", Slug = "pro", Description = "Ideal for growing medical practices.", PriceMonthly = 7740, PriceAnnually = 5940, IsHighlighted = true, RequiresCheckout = true, CreatedAt = seedDate },
            new SubscriptionPlan { Id = enterpriseId, Name = "Enterprise", Slug = "enterprise", Description = "For large hospitals and clinic networks.", PriceMonthly = 0, PriceAnnually = 0, IsHighlighted = false, RequiresCheckout = false, CreatedAt = seedDate }
        };

        foreach (var plan in plans)
        {
            if (!await _context.SubscriptionPlans.AnyAsync(p => p.Id == plan.Id, cancellationToken))
            {
                _context.SubscriptionPlans.Add(plan);
            }
        }

        var features = new[]
        {
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000001"), SubscriptionPlanId = starterId, Name = "1 Clinic Location", DisplayOrder = 1, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000002"), SubscriptionPlanId = starterId, Name = "Up to 3 Staff Members", DisplayOrder = 2, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000003"), SubscriptionPlanId = starterId, Name = "Up to 500 Patients", DisplayOrder = 3, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000004"), SubscriptionPlanId = starterId, Name = "Basic Support", DisplayOrder = 4, CreatedAt = seedDate },
            
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000001"), SubscriptionPlanId = proId, Name = "Up to 5 Clinic Locations", DisplayOrder = 1, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000002"), SubscriptionPlanId = proId, Name = "Up to 15 Staff Members", DisplayOrder = 2, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000003"), SubscriptionPlanId = proId, Name = "Up to 5,000 Patients", DisplayOrder = 3, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000004"), SubscriptionPlanId = proId, Name = "Priority Email Support", DisplayOrder = 4, CreatedAt = seedDate },
            
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000001"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Clinic Locations", DisplayOrder = 1, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000002"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Staff Members", DisplayOrder = 2, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000003"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Patients", DisplayOrder = 3, CreatedAt = seedDate },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000004"), SubscriptionPlanId = enterpriseId, Name = "24/7 Dedicated Support", DisplayOrder = 4, CreatedAt = seedDate }
        };

        foreach (var feature in features)
        {
            if (!await _context.SubscriptionPlanFeatures.AnyAsync(f => f.Id == feature.Id, cancellationToken))
            {
                _context.SubscriptionPlanFeatures.Add(feature);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
