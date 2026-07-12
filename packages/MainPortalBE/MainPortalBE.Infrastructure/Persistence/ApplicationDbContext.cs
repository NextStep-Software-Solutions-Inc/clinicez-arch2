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
    public DbSet<PaymentReceipt> PaymentReceipts { get; set; }
    public DbSet<BillingInvoice> BillingInvoices { get; set; }
    public DbSet<BlogArticle> BlogArticles { get; set; }
    public DbSet<AdminRole> AdminRoles { get; set; }
    public DbSet<AdminUser> AdminUsers { get; set; }

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

        modelBuilder.Entity<BillingInvoice>()
            .HasIndex(i => i.XenditInvoiceId)
            .IsUnique();

        modelBuilder.Entity<BlogArticle>()
            .HasIndex(b => b.Slug)
            .IsUnique();

        modelBuilder.Entity<AdminRole>()
            .Property(r => r.Permissions)
            .Metadata
            .SetValueComparer(new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                (c1, c2) => c1 == null && c2 == null || c1 != null && c2 != null && System.Linq.Enumerable.SequenceEqual(c1, c2),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                c => c.ToList()));

        modelBuilder.Entity<BillingInvoice>()
            .HasOne(i => i.Tenant)
            .WithMany()
            .HasForeignKey(i => i.TenantId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PaymentReceipt>()
            .HasOne(r => r.Invoice)
            .WithOne()
            .HasForeignKey<PaymentReceipt>(r => r.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PaymentReceipt>()
            .HasOne(r => r.Tenant)
            .WithMany()
            .HasForeignKey(r => r.TenantId)
            .OnDelete(DeleteBehavior.Restrict);

        Seeders.SubscriptionPlanSeeder.Seed(modelBuilder);
        Seeders.AdminRBACSeeder.Seed(modelBuilder);
        Seeders.BlogSeeder.Seed(modelBuilder);

        base.OnModelCreating(modelBuilder);
    }
}
