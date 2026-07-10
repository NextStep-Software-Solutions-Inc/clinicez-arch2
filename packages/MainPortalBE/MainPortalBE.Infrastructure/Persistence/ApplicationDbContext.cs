using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Common;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using System.Linq.Expressions;

namespace MainPortalBE.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<ExampleEntity> ExampleEntities { get; set; }
    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<SubscriptionPlan> SubscriptionPlans { get; set; }
    public DbSet<SubscriptionPlanFeature> SubscriptionPlanFeatures { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        const string schemaName = "main";
        modelBuilder.HasDefaultSchema(schemaName);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entity.FindProperty("Id");

            if (idProperty == null)
            {
                continue;
            }

            if (idProperty.ClrType == typeof(Guid))
            {
                idProperty.SetDefaultValueSql("gen_random_uuid()");
            }

            entity.SetPrimaryKey(idProperty);
            idProperty.ValueGenerated = ValueGenerated.OnAdd;
        }

        // Apply soft delete query filter
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(IEntity).IsAssignableFrom(entityType.ClrType))
            {
                var parameter = Expression.Parameter(entityType.ClrType, "e");
                var property = Expression.Property(parameter, nameof(IEntity.IsDeleted));
                var notDeleted = Expression.Not(property);
                var lambda = Expression.Lambda(notDeleted, parameter);
                entityType.SetQueryFilter(lambda);
            }
        }

        // Example entity configuration
        modelBuilder.Entity<ExampleEntity>()
            .HasIndex(e => e.Name)
            .IsUnique();

        modelBuilder.Entity<Tenant>()
            .HasIndex(t => t.TenantSlug)
            .IsUnique();

        modelBuilder.Entity<SubscriptionPlan>()
            .HasIndex(p => p.Slug)
            .IsUnique();

        modelBuilder.Entity<SubscriptionPlan>()
            .HasMany(p => p.Features)
            .WithOne(f => f.SubscriptionPlan)
            .HasForeignKey(f => f.SubscriptionPlanId)
            .OnDelete(DeleteBehavior.Cascade);

        SeedSubscriptionPlans(modelBuilder);

        base.OnModelCreating(modelBuilder);
    }

    private void SeedSubscriptionPlans(ModelBuilder modelBuilder)
    {
        var starterId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var proId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var enterpriseId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        modelBuilder.Entity<SubscriptionPlan>().HasData(
            new SubscriptionPlan { Id = starterId, Name = "Starter", Slug = "starter", Description = "Perfect for small individual clinics.", PriceMonthly = 49, PriceAnnually = 39, IsHighlighted = false, RequiresCheckout = true, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlan { Id = proId, Name = "Professional", Slug = "pro", Description = "Ideal for growing medical practices.", PriceMonthly = 129, PriceAnnually = 99, IsHighlighted = true, RequiresCheckout = true, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlan { Id = enterpriseId, Name = "Enterprise", Slug = "enterprise", Description = "For large hospitals and clinic networks.", PriceMonthly = 0, PriceAnnually = 0, IsHighlighted = false, RequiresCheckout = false, CreatedAt = DateTime.UtcNow }
        );

        modelBuilder.Entity<SubscriptionPlanFeature>().HasData(
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000001"), SubscriptionPlanId = starterId, Name = "1 Clinic Location", DisplayOrder = 1, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000002"), SubscriptionPlanId = starterId, Name = "Up to 3 Staff Members", DisplayOrder = 2, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000003"), SubscriptionPlanId = starterId, Name = "Up to 500 Patients", DisplayOrder = 3, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("11111111-0000-0000-0000-000000000004"), SubscriptionPlanId = starterId, Name = "Basic Support", DisplayOrder = 4, CreatedAt = DateTime.UtcNow },
            
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000001"), SubscriptionPlanId = proId, Name = "Up to 5 Clinic Locations", DisplayOrder = 1, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000002"), SubscriptionPlanId = proId, Name = "Up to 15 Staff Members", DisplayOrder = 2, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000003"), SubscriptionPlanId = proId, Name = "Up to 5,000 Patients", DisplayOrder = 3, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("22222222-0000-0000-0000-000000000004"), SubscriptionPlanId = proId, Name = "Priority Email Support", DisplayOrder = 4, CreatedAt = DateTime.UtcNow },
            
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000001"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Clinic Locations", DisplayOrder = 1, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000002"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Staff Members", DisplayOrder = 2, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000003"), SubscriptionPlanId = enterpriseId, Name = "Unlimited Patients", DisplayOrder = 3, CreatedAt = DateTime.UtcNow },
            new SubscriptionPlanFeature { Id = Guid.Parse("33333333-0000-0000-0000-000000000004"), SubscriptionPlanId = enterpriseId, Name = "24/7 Dedicated Support", DisplayOrder = 4, CreatedAt = DateTime.UtcNow }
        );
    }
}
