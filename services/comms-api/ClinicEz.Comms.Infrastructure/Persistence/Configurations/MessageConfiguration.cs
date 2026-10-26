using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class MessageConfiguration : IEntityTypeConfiguration<Message>
{
    public void Configure(EntityTypeBuilder<Message> builder)
    {
        builder.ToTable("comms_messages");
        builder.HasKey(m => m.Id);

        builder.Property(m => m.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(m => m.FacilityId).IsRequired().HasMaxLength(100);
        builder.Property(m => m.SenderType).IsRequired().HasMaxLength(32);
        builder.Property(m => m.SenderId).HasMaxLength(100);
        builder.Property(m => m.SenderDisplayName).IsRequired().HasMaxLength(200);

        builder.Property(m => m.ContentText).IsRequired();
        builder.Property(m => m.Visibility).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(m => m.State).HasConversion<string>().HasMaxLength(32).IsRequired();

        builder.Property(m => m.AcknowledgedByName).HasMaxLength(200);
        builder.Property(m => m.ChartFiledByStaffId).HasMaxLength(100);

        builder.HasMany(m => m.Reactions)
            .WithOne(r => r.Message)
            .HasForeignKey(r => r.MessageId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(m => m.Attachments)
            .WithOne(a => a.Message)
            .HasForeignKey(a => a.MessageId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(m => new { m.ConversationId, m.Seq }).IsUnique();
        builder.HasIndex(m => new { m.ConversationId, m.ClientMessageId });
        builder.HasIndex(m => new { m.TenantId, m.FacilityId, m.State, m.RetentionDeadlineUtc });
        builder.HasIndex(m => new { m.ConversationId, m.ServerReceivedAtUtc });
    }
}
