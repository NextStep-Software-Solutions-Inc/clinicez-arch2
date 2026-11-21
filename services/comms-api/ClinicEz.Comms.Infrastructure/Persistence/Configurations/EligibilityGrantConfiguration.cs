using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class EligibilityGrantConfiguration : IEntityTypeConfiguration<EligibilityGrant>
{
    public void Configure(EntityTypeBuilder<EligibilityGrant> builder)
    {
        builder.ToTable("comms_eligibility_grants");
        builder.HasKey(g => g.Id);

        builder.Property(g => g.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(g => g.FacilityId).IsRequired().HasMaxLength(100);
        builder.Property(g => g.FacilityType).IsRequired().HasMaxLength(32);
        builder.Property(g => g.ContextType).IsRequired().HasMaxLength(64);
        builder.Property(g => g.ContextId).IsRequired().HasMaxLength(128);
        builder.Property(g => g.RevokeReason).HasMaxLength(500);

        builder.HasIndex(g => new { g.TenantId, g.FacilityId, g.PatientId, g.IsActive, g.WindowStartUtc, g.WindowEndUtc });
        builder.HasIndex(g => new { g.TenantId, g.ContextType, g.ContextId });
    }
}
