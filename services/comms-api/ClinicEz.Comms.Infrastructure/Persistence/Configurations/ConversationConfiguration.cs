using ClinicEz.Comms.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Comms.Infrastructure.Persistence.Configurations;

public class ConversationConfiguration : IEntityTypeConfiguration<Conversation>
{
    public void Configure(EntityTypeBuilder<Conversation> builder)
    {
        builder.ToTable("comms_conversations");
        builder.HasKey(c => c.Id);

        builder.Property(c => c.TenantId).IsRequired().HasMaxLength(100);
        builder.Property(c => c.FacilityId).IsRequired().HasMaxLength(100);
        builder.Property(c => c.BranchId).HasMaxLength(100);

        builder.Property(c => c.Scope).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(c => c.Kind).HasConversion<string>().HasMaxLength(32).IsRequired();

        builder.Property(c => c.ContextType).HasMaxLength(64);
        builder.Property(c => c.ContextId).HasMaxLength(128);

        builder.Property(c => c.Title).IsRequired().HasMaxLength(200);
        builder.Property(c => c.Category).HasConversion<string>().HasMaxLength(32);

        builder.Property(c => c.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(c => c.TriageDisposition).HasConversion<string>().HasMaxLength(32);
        builder.Property(c => c.DeclineReasonCode).HasMaxLength(64);

        builder.Property(c => c.AssignedStaffId).HasMaxLength(100);
        builder.Property(c => c.AssignedStaffName).HasMaxLength(200);
        builder.Property(c => c.Priority).HasMaxLength(32);

        builder.Property(c => c.Relationship).HasMaxLength(64);
        builder.Property(c => c.TriagedByStaffId).HasMaxLength(100);
        builder.Property(c => c.TriagedByStaffName).HasMaxLength(200);

        builder.Property(c => c.HomeCellId).IsRequired().HasMaxLength(64);
        builder.Property(c => c.LastMessageSnippet).HasMaxLength(255);
        builder.Property(c => c.CreatedBy).IsRequired().HasMaxLength(200);
        builder.Property(c => c.ClosedBy).HasMaxLength(200);

        builder.HasMany(c => c.Participants)
            .WithOne(p => p.Conversation)
            .HasForeignKey(p => p.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Messages)
            .WithOne(m => m.Conversation)
            .HasForeignKey(m => m.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => new { c.TenantId, c.FacilityId, c.Scope, c.Status });
        builder.HasIndex(c => new { c.TenantId, c.FacilityId, c.Status, c.CreatedAtUtc });
        builder.HasIndex(c => new { c.TenantId, c.FacilityId, c.Status, c.TriageDueAtUtc });
        builder.HasIndex(c => new { c.TenantId, c.PatientId, c.Status, c.CreatedAtUtc });
        builder.HasIndex(c => new { c.TenantId, c.ContextType, c.ContextId });
        builder.HasIndex(c => new { c.TenantId, c.LastMessageAtUtc });
    }
}
