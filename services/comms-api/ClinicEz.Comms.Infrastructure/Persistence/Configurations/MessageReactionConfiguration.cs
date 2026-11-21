using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class MessageReactionConfiguration : IEntityTypeConfiguration<MessageReaction>
{
    public void Configure(EntityTypeBuilder<MessageReaction> builder)
    {
        builder.ToTable("comms_message_reactions");
        builder.HasKey(r => new { r.MessageId, r.UserId, r.Reaction });

        builder.Property(r => r.UserId).IsRequired().HasMaxLength(100);
        builder.Property(r => r.UserDisplayName).HasMaxLength(200);
        builder.Property(r => r.Reaction).IsRequired().HasMaxLength(32);
    }
}
