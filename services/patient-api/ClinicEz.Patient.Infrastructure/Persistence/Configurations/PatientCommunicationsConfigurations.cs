using ClinicEz.Patient.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class PatientConversationConfiguration : IEntityTypeConfiguration<PatientConversation>
{
    public void Configure(EntityTypeBuilder<PatientConversation> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.HomeTenantId).HasMaxLength(64).IsRequired();
        builder.Property(c => c.HomeFacilityId).HasMaxLength(64).IsRequired();
        builder.Property(c => c.HomeFacilityType).HasMaxLength(32).IsRequired();
        builder.Property(c => c.FacilityName).HasMaxLength(128).IsRequired();
        builder.Property(c => c.Subject).HasMaxLength(256).IsRequired();
        builder.Property(c => c.LastMessagePreview).HasMaxLength(256);
        builder.Property(c => c.ContextType).HasMaxLength(64);
        builder.Property(c => c.ContextId).HasMaxLength(128);
        builder.Property(c => c.DeclineReasonCode).HasMaxLength(64);
        builder.Property(c => c.AssignedStaffDisplayName).HasMaxLength(128);
        builder.Property(c => c.SubmittingAccountName).HasMaxLength(128);
        builder.Property(c => c.RelationshipToPatient).HasMaxLength(50);

        builder.HasOne(c => c.Patient)
            .WithMany()
            .HasForeignKey(c => c.PatientId)
            .OnDelete(DeleteBehavior.Restrict);

        // Unified inbox index: Patient + Hidden filter + Sorting by latest message
        builder.HasIndex(c => new { c.PatientId, c.IsHiddenByPatient, c.LastMessageAtUtc });
        builder.HasIndex(c => new { c.HomeTenantId, c.HomeFacilityId });
        builder.HasIndex(c => c.SubmittingAccountId);
    }
}

public sealed class PatientMessageConfiguration : IEntityTypeConfiguration<PatientMessage>
{
    public void Configure(EntityTypeBuilder<PatientMessage> builder)
    {
        builder.HasKey(m => m.Id);

        builder.Property(m => m.SenderType).HasMaxLength(32).IsRequired();
        builder.Property(m => m.SenderName).HasMaxLength(128).IsRequired();
        builder.Property(m => m.ContentText).HasMaxLength(1000).IsRequired();
        builder.Property(m => m.AcknowledgedByName).HasMaxLength(128);

        builder.HasOne(m => m.Conversation)
            .WithMany(c => c.Messages)
            .HasForeignKey(m => m.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(m => new { m.ConversationId, m.Seq });
        builder.HasIndex(m => m.ClientMessageId).IsUnique(); // Deduplication guard
        builder.HasIndex(m => new { m.DeliveryState, m.RetentionDeadlineUtc }); // Retention sweep index
    }
}

public sealed class PatientMessageAttachmentConfiguration : IEntityTypeConfiguration<PatientMessageAttachment>
{
    public void Configure(EntityTypeBuilder<PatientMessageAttachment> builder)
    {
        builder.HasKey(a => a.Id);

        builder.Property(a => a.FileName).HasMaxLength(256).IsRequired();
        builder.Property(a => a.ContentType).HasMaxLength(128).IsRequired();
        builder.Property(a => a.StorageKey).HasMaxLength(512).IsRequired();
        builder.Property(a => a.ScanStatus).HasMaxLength(32).IsRequired();
        builder.Property(a => a.HashSha256).HasMaxLength(64);

        builder.HasOne(a => a.Message)
            .WithMany(m => m.Attachments)
            .HasForeignKey(a => a.MessageId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientEligibilityGrantConfiguration : IEntityTypeConfiguration<PatientEligibilityGrant>
{
    public void Configure(EntityTypeBuilder<PatientEligibilityGrant> builder)
    {
        builder.HasKey(g => g.Id);

        builder.Property(g => g.TenantId).HasMaxLength(64).IsRequired();
        builder.Property(g => g.FacilityId).HasMaxLength(64).IsRequired();
        builder.Property(g => g.FacilityType).HasMaxLength(32).IsRequired();
        builder.Property(g => g.FacilityName).HasMaxLength(128).IsRequired();
        builder.Property(g => g.ContextType).HasMaxLength(64).IsRequired();
        builder.Property(g => g.ContextId).HasMaxLength(128).IsRequired();

        builder.HasOne(g => g.Patient)
            .WithMany()
            .HasForeignKey(g => g.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(g => g.GrantId).IsUnique();
        builder.HasIndex(g => new { g.PatientId, g.IsActive, g.ExpiresAtUtc });
        builder.HasIndex(g => new { g.TenantId, g.FacilityId, g.ContextType, g.ContextId });
    }
}

public sealed class PatientCallSessionConfiguration : IEntityTypeConfiguration<PatientCallSession>
{
    public void Configure(EntityTypeBuilder<PatientCallSession> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.TenantId).HasMaxLength(64).IsRequired();
        builder.Property(s => s.FacilityId).HasMaxLength(64).IsRequired();
        builder.Property(s => s.FacilityType).HasMaxLength(32).IsRequired();
        builder.Property(s => s.FacilityName).HasMaxLength(128).IsRequired();
        builder.Property(s => s.Status).HasMaxLength(32).IsRequired();
        builder.Property(s => s.RoomName).HasMaxLength(128);
        builder.Property(s => s.LiveKitToken).HasColumnType("text");

        builder.HasOne(s => s.Patient)
            .WithMany()
            .HasForeignKey(s => s.PatientId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(s => s.Conversation)
            .WithMany(c => c.CallSessions)
            .HasForeignKey(s => s.ConversationId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(s => s.CallId).IsUnique();
        builder.HasIndex(s => new { s.PatientId, s.Status });
    }
}
