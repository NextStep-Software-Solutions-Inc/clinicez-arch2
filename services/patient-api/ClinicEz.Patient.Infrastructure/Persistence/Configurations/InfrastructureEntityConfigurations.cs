using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class FileRecordConfiguration : IEntityTypeConfiguration<FileRecord>
{
    public void Configure(EntityTypeBuilder<FileRecord> builder)
    {
        builder.HasKey(f => f.Id);
        builder.Property(f => f.FileName).HasMaxLength(255).IsRequired();
        builder.Property(f => f.MimeType).HasMaxLength(100);
        builder.Property(f => f.Extension).HasMaxLength(20);
        builder.Property(f => f.StorageKey).HasMaxLength(500).IsRequired();

        builder.Property(f => f.SyncStatus).HasConversion<string>().HasMaxLength(20);
        builder.Property(f => f.SyncError).HasMaxLength(500);
        builder.Property(f => f.EncryptionAlgorithm).HasMaxLength(50);
        builder.Property(f => f.EncryptionKeyId).HasMaxLength(100);
        builder.Property(f => f.EncryptionIvBase64).HasMaxLength(100);
        builder.Property(f => f.EncryptionTagBase64).HasMaxLength(100);
        builder.Property(f => f.EncryptedHash).HasMaxLength(200);
        builder.Property(f => f.WrappedKeyJson).HasColumnType("text");
        builder.Property(f => f.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(f => f.UpdatedBy).HasMaxLength(128);

        builder.HasOne(f => f.Patient)
            .WithMany(p => p.Files)
            .HasForeignKey(f => f.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(f => f.Folder)
            .WithMany(ff => ff.Files)
            .HasForeignKey(f => f.FolderId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.ServiceType).HasMaxLength(200);
        builder.Property(a => a.Notes).HasMaxLength(1000);
        builder.Property(a => a.Status).HasConversion<string>().HasMaxLength(30);
        builder.Property(a => a.RawJson).HasColumnType("text").IsRequired();
        builder.Property(a => a.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(a => a.UpdatedBy).HasMaxLength(128);

        builder.HasOne(a => a.Patient)
            .WithMany(p => p.Appointments)
            .HasForeignKey(a => a.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => new { a.PatientId, a.ScheduledAt });
        builder.HasIndex(a => new { a.PatientId, a.Status });
    }
}

public sealed class SyncLogConfiguration : IEntityTypeConfiguration<SyncLog>
{
    public void Configure(EntityTypeBuilder<SyncLog> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.EntityType).HasMaxLength(100).IsRequired();
        builder.Property(s => s.EntityId).IsRequired(false);
        builder.Property(s => s.Operation).HasConversion<string>().HasMaxLength(20);
        builder.Property(s => s.Status).HasConversion<string>().HasMaxLength(30);
        builder.Property(s => s.ConflictDetail).HasColumnType("text");
        builder.Property(s => s.PayloadJson).HasColumnType("text");
        builder.Property(s => s.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(s => s.UpdatedBy).HasMaxLength(128);

        builder.HasOne(s => s.Patient)
            .WithMany(p => p.SyncLogs)
            .HasForeignKey(s => s.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(s => new { s.PatientId, s.Status });
        builder.HasIndex(s => new { s.EntityType, s.EntityId });
    }
}

public sealed class DeviceSessionConfiguration : IEntityTypeConfiguration<DeviceSession>
{
    public void Configure(EntityTypeBuilder<DeviceSession> builder)
    {
        builder.HasKey(d => d.Id);
        builder.Property(d => d.DeviceId).HasMaxLength(128).IsRequired();
        builder.Property(d => d.DeviceLabel).HasMaxLength(200).IsRequired();
        builder.Property(d => d.ClerkSessionId).HasMaxLength(256).IsRequired();
        builder.Property(d => d.RedisKey).HasMaxLength(256).IsRequired();
        builder.Property(d => d.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(d => d.UpdatedBy).HasMaxLength(128);

        builder.HasOne(d => d.Patient)
            .WithMany(p => p.DeviceSessions)
            .HasForeignKey(d => d.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        // Only one active session per patient at a time
        builder.HasIndex(d => d.PatientId)
            .HasFilter("is_revoked = false")
            .IsUnique();
    }
}

public sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.HasKey(n => n.Id);
        builder.Property(n => n.Type).HasConversion<string>().HasMaxLength(50);
        builder.Property(n => n.Category).HasConversion<string>().HasMaxLength(30);
        builder.Property(n => n.Title).HasMaxLength(300).IsRequired();
        builder.Property(n => n.Body).HasMaxLength(1000).IsRequired();
        builder.Property(n => n.SourceId).HasMaxLength(128);
        builder.Property(n => n.Payload).HasColumnType("text");
        builder.Property(n => n.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(n => n.UpdatedBy).HasMaxLength(128);

        builder.HasOne(n => n.Patient)
            .WithMany(p => p.Notifications)
            .HasForeignKey(n => n.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(n => new { n.PatientId, n.IsRead });
        builder.HasIndex(n => new { n.PatientId, n.Category });
    }
}

public sealed class DocumentTypeConfiguration : IEntityTypeConfiguration<DocumentType>
{
    public void Configure(EntityTypeBuilder<DocumentType> builder)
    {
        builder.HasKey(d => d.Id);
        builder.Property(d => d.Code).HasMaxLength(100).IsRequired();
        builder.Property(d => d.Label).HasMaxLength(200).IsRequired();
        builder.Property(d => d.Description).HasMaxLength(500);
        builder.Property(d => d.SupportedExtensionsJson).HasColumnType("text").IsRequired();
        builder.Property(d => d.SupportedMimeTypesJson).HasColumnType("text").IsRequired();
        builder.Property(d => d.NativePreviewKind).HasMaxLength(50).IsRequired();
        
        builder.HasIndex(d => d.Code).IsUnique();

        builder.HasData(
            new DocumentType
            {
                Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Code = "xray",
                Label = "X-ray",
                Description = "Radiology images and x-ray reports.",
                SupportedExtensionsJson = "[\"jpg\",\"jpeg\",\"png\",\"pdf\",\"dcm\"]",
                SupportedMimeTypesJson = "[\"image/*\",\"application/pdf\"]",
                NativePreviewKind = "image",
                SortOrder = 10,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            },
            new DocumentType
            {
                Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                Code = "lab-result",
                Label = "Lab result",
                Description = "Laboratory result PDFs or images.",
                SupportedExtensionsJson = "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]",
                SupportedMimeTypesJson = "[\"application/pdf\",\"image/*\"]",
                NativePreviewKind = "pdf",
                SortOrder = 20,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            },
            new DocumentType
            {
                Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                Code = "medical-certificate",
                Label = "Medical certificate",
                Description = "Medical certificates and fit-to-work documents.",
                SupportedExtensionsJson = "[\"pdf\",\"jpg\",\"jpeg\",\"png\",\"doc\",\"docx\"]",
                SupportedMimeTypesJson = "[\"application/pdf\",\"image/*\",\"application/msword\"]",
                NativePreviewKind = "pdf",
                SortOrder = 30,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            },
            new DocumentType
            {
                Id = Guid.Parse("44444444-4444-4444-4444-444444444444"),
                Code = "prescription",
                Label = "Prescription",
                Description = "Prescription scans, images, and PDFs.",
                SupportedExtensionsJson = "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]",
                SupportedMimeTypesJson = "[\"application/pdf\",\"image/*\"]",
                NativePreviewKind = "pdf",
                SortOrder = 40,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            },
            new DocumentType
            {
                Id = Guid.Parse("55555555-5555-5555-5555-555555555555"),
                Code = "id",
                Label = "Government ID",
                Description = "IDs and identity verification documents.",
                SupportedExtensionsJson = "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]",
                SupportedMimeTypesJson = "[\"application/pdf\",\"image/*\"]",
                NativePreviewKind = "image",
                SortOrder = 50,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            },
            new DocumentType
            {
                Id = Guid.Parse("66666666-6666-6666-6666-666666666666"),
                Code = "other",
                Label = "Other medical file",
                Description = "Any other medical documents.",
                SupportedExtensionsJson = "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]",
                SupportedMimeTypesJson = "[\"application/pdf\",\"image/*\"]",
                NativePreviewKind = "external",
                SortOrder = 999,
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                CreatedBy = "system"
            }
        );
    }
}
