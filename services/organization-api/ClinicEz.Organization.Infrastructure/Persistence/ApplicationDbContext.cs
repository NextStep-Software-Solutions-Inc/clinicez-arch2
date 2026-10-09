using ClinicEz.Organization.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Organization.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, Microsoft.Extensions.Configuration.IConfiguration configuration) : DbContext(options), IInteropDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; }
    public DbSet<InteropInboxMessage> InteropInbox { get; set; }
    public DbSet<Product> Products { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }
        modelBuilder.HasDefaultSchema(schemaName);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entity.FindProperty("Id");
            if (idProperty == null) continue;

            if (entity.FindPrimaryKey() == null)
            {
                if (idProperty.ClrType == typeof(Guid))
                {
                    idProperty.SetDefaultValueSql("gen_random_uuid()");
                }
                entity.SetPrimaryKey(idProperty);
                idProperty.ValueGenerated = ValueGenerated.OnAdd;
            }
        }

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.ApplyInteropModel();

        base.OnModelCreating(modelBuilder);
    }
}







