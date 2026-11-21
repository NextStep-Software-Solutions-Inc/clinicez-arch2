using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class GuestInviteConfiguration : IEntityTypeConfiguration<GuestInvite>
{
    public void Configure(EntityTypeBuilder<GuestInvite> builder)
    {
        builder.ToTable("comms_guest_invites");
        builder.HasKey(i => i.Id);

        builder.Property(i => i.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(i => i.FacilityId).IsRequired().HasMaxLength(100);
        builder.Property(i => i.InviteTokenHash).IsRequired().HasMaxLength(128);
        builder.Property(i => i.ExpectedDobHash).IsRequired().HasMaxLength(128);
        builder.Property(i => i.OtpHash).IsRequired().HasMaxLength(128);
        builder.Property(i => i.CreatedByStaffId).HasMaxLength(100);
        builder.Property(i => i.MaskedRecipientPhone).HasMaxLength(50);
        builder.Property(i => i.Status).HasConversion<string>().HasMaxLength(32);

        builder.HasIndex(i => i.InviteTokenHash).IsUnique();
        builder.HasIndex(i => new { i.TenantId, i.FacilityId, i.CallId });
        builder.HasIndex(i => new { i.Status, i.ExpiresAtUtc });
    }
}
