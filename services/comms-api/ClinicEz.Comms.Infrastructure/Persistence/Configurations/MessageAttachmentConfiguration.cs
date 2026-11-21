using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class MessageAttachmentConfiguration : IEntityTypeConfiguration<MessageAttachment>
{
    public void Configure(EntityTypeBuilder<MessageAttachment> builder)
    {
        builder.ToTable("comms_message_attachments");
        builder.HasKey(a => a.Id);

        builder.Property(a => a.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(a => a.FacilityId).IsRequired().HasMaxLength(100);
        builder.Property(a => a.OriginalFileName).IsRequired().HasMaxLength(255);
        builder.Property(a => a.SafeFileName).IsRequired().HasMaxLength(120);
        builder.Property(a => a.ContentType).IsRequired().HasMaxLength(100);
        builder.Property(a => a.StoragePath).IsRequired().HasMaxLength(500);
        builder.Property(a => a.SHA256Checksum).IsRequired().HasMaxLength(64);

        builder.Property(a => a.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(a => a.QuarantineReason).HasMaxLength(500);
        builder.Property(a => a.ConvertedFromOriginal).HasMaxLength(100);

        builder.Property(a => a.EncryptionAlgorithm).IsRequired().HasMaxLength(32);
        builder.Property(a => a.EncryptionKeyId).IsRequired().HasMaxLength(64);
        builder.Property(a => a.FiledByStaffId).HasMaxLength(100);

        builder.HasIndex(a => new { a.TenantId, a.FacilityId });
        builder.HasIndex(a => a.MessageId);
        builder.HasIndex(a => a.SHA256Checksum);
    }
}
