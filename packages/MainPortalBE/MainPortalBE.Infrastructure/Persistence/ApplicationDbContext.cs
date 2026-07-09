using MainPortalBE.Domain.Common;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using System.Linq.Expressions;

namespace MainPortalBE.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<ExampleEntity> ExampleEntities { get; set; }
    public DbSet<Tenant> Tenants { get; set; }

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

        base.OnModelCreating(modelBuilder);
    }
}
