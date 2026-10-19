using ClinicEz.Organization.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Organization.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, Microsoft.Extensions.Configuration.IConfiguration configuration) : DbContext(options), IInteropDbContext, IWorkspaceProfileDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; }
    public DbSet<InteropInboxMessage> InteropInbox { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<OrganizationFacility> OrganizationFacilities { get; set; }
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();

    /// <summary>Every enum is persisted as its C# name (nullable enums included), never as a number.</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(64);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"] ?? "public";
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

        modelBuilder.Entity<OrganizationFacility>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PlanTier).IsRequired().HasMaxLength(50);
            entity.HasIndex(e => new { e.TenantId, e.FacilityId }).IsUnique();
        });

        modelBuilder.ApplyInteropModel();
        modelBuilder.ApplyWorkspaceProfileModel();

        base.OnModelCreating(modelBuilder);
    }
}







