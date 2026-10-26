using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class ParticipantConfiguration : IEntityTypeConfiguration<Participant>
{
    public void Configure(EntityTypeBuilder<Participant> builder)
    {
        builder.ToTable("comms_participants");
        builder.HasKey(p => p.Id);

        builder.Property(p => p.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(p => p.ParticipantType).IsRequired().HasMaxLength(32);
        builder.Property(p => p.ParticipantId).IsRequired().HasMaxLength(100);
        builder.Property(p => p.DisplayName).IsRequired().HasMaxLength(200);
        builder.Property(p => p.Role).IsRequired().HasMaxLength(32);

        builder.HasIndex(p => new { p.ConversationId, p.ParticipantType, p.ParticipantId }).IsUnique();
        builder.HasIndex(p => new { p.TenantId, p.ParticipantType, p.ParticipantId });
    }
}
