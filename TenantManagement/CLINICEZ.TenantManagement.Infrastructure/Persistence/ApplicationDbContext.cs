using CLINICEZ.TenantManagement.Domain.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using System.Linq.Expressions;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<Module> Modules { get; set; }
    public DbSet<TenantSetting> TenantSettings { get; set; }
    public DbSet<TenantSubscription> TenantSubscriptions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {

        const string schemaName = "catalog";
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

        // Tenant
        modelBuilder.Entity<Tenant>()
            .HasIndex(t => t.Name )
            .IsUnique();

        modelBuilder.Entity<Tenant>()
            .HasMany(t => t.Modules)
            .WithMany(m => m.Tenants)
            .UsingEntity(tm => tm.ToTable("TenantModule"));

        modelBuilder.Entity<Tenant>()
            .HasOne(t => t.TenantSetting)
            .WithOne(ts => ts.Tenant)
            .HasForeignKey<TenantSetting>(ts => ts.TenantId);

        modelBuilder.Entity<Tenant>()
            .HasMany(t => t.TenantSubscriptions)
            .WithOne(ts => ts.Tenant)
            .HasForeignKey(ts => ts.TenantId);

        // Module
        modelBuilder.Entity<Module>()
            .HasIndex(m => m.Name)
            .IsUnique();

        // TenantSetting
        modelBuilder.Entity<TenantSetting>()
            .HasIndex(ts => ts.TenantId )
            .IsUnique();

        // TenantSubscription
        modelBuilder.Entity<TenantSubscription>()
            .HasIndex(ts => new { ts.TenantId, ts.StartDate, ts.EndDate })
            .IsUnique();

        //TenantMember
        modelBuilder.Entity<TenantMember>()
            .HasIndex(tm => new {tm.TenantId, tm.UserId})
            .IsUnique();

        modelBuilder.Entity<TenantMember>()
            .HasOne(tm => tm.Tenant)
            .WithMany(t => t.TenantMembers)
            .HasForeignKey(tm => tm.TenantId);

        // Persist TenantMember enums as strings
        modelBuilder.Entity<TenantMember>()
            .Property(tm => tm.Role)
            .HasConversion<string>();

        modelBuilder.Entity<TenantMember>()
            .Property(tm => tm.Status)
            .HasConversion<string>();

        base.OnModelCreating(modelBuilder);
    }
}
