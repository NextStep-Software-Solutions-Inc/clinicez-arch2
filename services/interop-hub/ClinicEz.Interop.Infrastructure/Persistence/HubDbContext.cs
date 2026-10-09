using ClinicEz.Interop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Interop.Infrastructure.Persistence;

public class HubDbContext(DbContextOptions<HubDbContext> options, IConfiguration configuration) : DbContext(options)
{
    public DbSet<HubCell> Cells { get; set; }
    public DbSet<HubClient> Clients { get; set; }
    public DbSet<HubFacility> Facilities { get; set; }
    public DbSet<HubLink> Links { get; set; }
    public DbSet<HubMessage> Messages { get; set; }
    public DbSet<HubConversation> Conversations { get; set; }
    public DbSet<HubOutboundMessage> Outbound { get; set; }
    public DbSet<HubClaim> Claims { get; set; }
    public DbSet<HubState> State { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }
        modelBuilder.HasDefaultSchema(schemaName);

        modelBuilder.Entity<HubCell>(e =>
        {
            e.HasKey(x => x.CellId);
            e.Property(x => x.CellId).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.TenantId).HasMaxLength(64);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
        });

        modelBuilder.Entity<HubClient>(e =>
        {
            e.HasKey(x => x.ClientId);
            e.Property(x => x.ClientId).HasMaxLength(128);
            e.Property(x => x.CellId).HasMaxLength(64).IsRequired();
            e.Property(x => x.Service).HasMaxLength(32).IsRequired();
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.SecretHash).HasMaxLength(256).IsRequired();
            e.HasIndex(x => x.CellId);
        });

        modelBuilder.Entity<HubFacility>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(256);
            e.Property(x => x.TenantId).HasMaxLength(64).IsRequired();
            e.Property(x => x.FacilityId).HasMaxLength(64).IsRequired();
            e.Property(x => x.CellId).HasMaxLength(64).IsRequired();
            e.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(x => x.BranchId).HasMaxLength(64);
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.FacilityType).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(x => x.CellId);
            e.HasIndex(x => x.TenantId);
        });

        modelBuilder.Entity<HubLink>(e =>
        {
            e.HasKey(x => x.LinkId);
            e.Property(x => x.SourceTenantId).HasMaxLength(64).IsRequired();
            e.Property(x => x.SourceFacilityId).HasMaxLength(64).IsRequired();
            e.Property(x => x.TargetTenantId).HasMaxLength(64).IsRequired();
            e.Property(x => x.TargetFacilityId).HasMaxLength(64).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Ignore(x => x.SourceKey);
            e.Ignore(x => x.TargetKey);
            e.HasIndex(x => new { x.SourceTenantId, x.SourceFacilityId });
            e.HasIndex(x => new { x.TargetTenantId, x.TargetFacilityId });
        });

        modelBuilder.Entity<HubMessage>(e =>
        {
            e.HasKey(x => x.Seq);
            e.Property(x => x.Seq).ValueGeneratedOnAdd();
            e.Property(x => x.Mailbox).HasMaxLength(128).IsRequired();
            e.Property(x => x.Type).HasMaxLength(128).IsRequired();
            e.Property(x => x.LastError).HasMaxLength(1000);
            e.HasIndex(x => x.MessageId).IsUnique();
            e.HasIndex(x => new { x.Mailbox, x.Seq });
            e.HasIndex(x => x.DeliveryId);
            e.HasIndex(x => x.ExpiresAtUtc);
        });

        modelBuilder.Entity<HubConversation>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedOnAdd();
            e.Property(x => x.FromKey).HasMaxLength(256).IsRequired();
            e.Property(x => x.ToKey).HasMaxLength(256).IsRequired();
            e.HasIndex(x => new { x.CorrelationId, x.FromKey, x.ToKey }).IsUnique();
            e.HasIndex(x => x.ExpiresAtUtc);
        });

        modelBuilder.Entity<HubOutboundMessage>(e =>
        {
            e.HasKey(x => x.Seq);
            e.Property(x => x.Seq).ValueGeneratedOnAdd();
            e.Property(x => x.Type).HasMaxLength(128).IsRequired();
            e.Property(x => x.LastError).HasMaxLength(1000);
            e.HasIndex(x => x.MessageId).IsUnique();
            e.HasIndex(x => new { x.CorrelationId, x.Seq });
            e.HasIndex(x => x.NextAttemptAtUtc);
        });

        modelBuilder.Entity<HubClaim>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            e.Property(x => x.IssuerTenantId).HasMaxLength(64).IsRequired();
            e.Property(x => x.IssuerFacilityId).HasMaxLength(64).IsRequired();
            e.Property(x => x.RedeemedByTenantId).HasMaxLength(64);
            e.Property(x => x.RedeemedByFacilityId).HasMaxLength(64);
            e.Property(x => x.TargetFacilityType).HasConversion<string>().HasMaxLength(24);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.ExpiresAtUtc);
        });

        modelBuilder.Entity<HubState>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(64);
            e.Property(x => x.Value).IsConcurrencyToken();
        });
    }
}
