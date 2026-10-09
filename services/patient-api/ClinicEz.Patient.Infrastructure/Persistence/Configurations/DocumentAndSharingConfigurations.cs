using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

internal static class AuditColumns
{
    public static void ConfigureAudit<T>(this EntityTypeBuilder<T> builder) where T : BaseEntity
    {
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.Property(e => e.DeletedBy).HasMaxLength(128);
    }
}

public sealed class PatientAccessGrantConfiguration : IEntityTypeConfiguration<PatientAccessGrant>
{
    public void Configure(EntityTypeBuilder<PatientAccessGrant> builder)
    {
        builder.HasKey(g => g.Id);
        builder.ConfigureAudit();
        builder.Property(g => g.TenantId).HasMaxLength(100).IsRequired();
        builder.Property(g => g.Purpose).HasMaxLength(200).IsRequired();
        builder.Property(g => g.Scopes).HasConversion<string>().HasMaxLength(200);
        builder.Property(g => g.Source).HasConversion<string>().HasMaxLength(20);

        builder.HasOne(g => g.Patient)
            .WithMany()
            .HasForeignKey(g => g.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(g => new { g.PatientId, g.CreatedAt });
        builder.HasIndex(g => new { g.PatientId, g.TenantId, g.FacilityId });
    }
}

public sealed class PatientAccessLogConfiguration : IEntityTypeConfiguration<PatientAccessLog>
{
    public void Configure(EntityTypeBuilder<PatientAccessLog> builder)
    {
        builder.HasKey(l => l.Id);
        builder.ConfigureAudit();
        builder.Property(l => l.Actor).HasMaxLength(300).IsRequired();
        builder.Property(l => l.Action).HasMaxLength(60).IsRequired();
        builder.Property(l => l.Detail).HasMaxLength(500);

        builder.HasOne(l => l.Patient)
            .WithMany()
            .HasForeignKey(l => l.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(l => l.Grant)
            .WithMany()
            .HasForeignKey(l => l.GrantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(l => new { l.PatientId, l.CreatedAt });
        builder.HasIndex(l => l.GrantId);
    }
}

public sealed class ShareTokenUseConfiguration : IEntityTypeConfiguration<ShareTokenUse>
{
    public void Configure(EntityTypeBuilder<ShareTokenUse> builder)
    {
        builder.HasKey(u => u.Id);
        builder.ConfigureAudit();
        builder.Property(u => u.TokenId).HasMaxLength(64).IsRequired();
        builder.HasIndex(u => u.TokenId).IsUnique();
    }
}

public sealed class LabRequestSlipConfiguration : IEntityTypeConfiguration<LabRequestSlip>
{
    public void Configure(EntityTypeBuilder<LabRequestSlip> builder)
    {
        builder.HasKey(s => s.Id);
        builder.ConfigureAudit();
        builder.Property(s => s.OrderingTenantId).HasMaxLength(100).IsRequired();
        builder.Property(s => s.OrderingFacilityId).HasMaxLength(64).IsRequired();
        builder.Property(s => s.OrderingFacilityName).HasMaxLength(200).IsRequired();
        builder.Property(s => s.AccessionNumber).HasMaxLength(60).IsRequired();
        builder.Property(s => s.Title).HasMaxLength(300).IsRequired();
        builder.Property(s => s.Urgency).HasMaxLength(30).IsRequired();
        builder.Property(s => s.Stage).HasConversion<string>().HasMaxLength(30);
        builder.Property(s => s.QuotedAmount).HasPrecision(12, 2);
        builder.Property(s => s.Currency).HasMaxLength(3);
        builder.Property(s => s.LaboratoryName).HasMaxLength(200);
        builder.Property(s => s.Reason).HasMaxLength(500);
        builder.Property(s => s.ClaimToken).HasMaxLength(2000);

        builder.HasOne(s => s.Patient)
            .WithMany()
            .HasForeignKey(s => s.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(s => new { s.PatientId, s.RequisitionId }).IsUnique();
    }
}

public sealed class MedicalCertificateConfiguration : IEntityTypeConfiguration<MedicalCertificate>
{
    public void Configure(EntityTypeBuilder<MedicalCertificate> builder)
    {
        builder.HasKey(c => c.Id);
        builder.ConfigureAudit();
        builder.Property(c => c.CertificateNumber).HasMaxLength(60).IsRequired();
        builder.Property(c => c.IssuerTenantId).HasMaxLength(100).IsRequired();
        builder.Property(c => c.IssuerFacilityId).HasMaxLength(64).IsRequired();
        builder.Property(c => c.IssuerName).HasMaxLength(200).IsRequired();
        builder.Property(c => c.DoctorName).HasMaxLength(200).IsRequired();
        builder.Property(c => c.DoctorPrcLicense).HasMaxLength(50).IsRequired();
        builder.Property(c => c.DoctorPtrNumber).HasMaxLength(50);
        builder.Property(c => c.Purpose).HasMaxLength(300).IsRequired();
        builder.Property(c => c.Diagnosis).HasMaxLength(500);
        builder.Property(c => c.Remarks).HasMaxLength(1000);
        builder.Property(c => c.VerificationToken).HasMaxLength(200);
        builder.Property(c => c.VerificationUrl).HasMaxLength(500);

        builder.HasOne(c => c.Patient)
            .WithMany()
            .HasForeignKey(c => c.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => new { c.PatientId, c.CertificateId }).IsUnique();
    }
}

public sealed class PrescriptionDocumentConfiguration : IEntityTypeConfiguration<PrescriptionDocument>
{
    public void Configure(EntityTypeBuilder<PrescriptionDocument> builder)
    {
        builder.HasKey(p => p.Id);
        builder.ConfigureAudit();
        builder.Property(p => p.PrescriptionNumber).HasMaxLength(60).IsRequired();
        builder.Property(p => p.OrderingTenantId).HasMaxLength(100).IsRequired();
        builder.Property(p => p.OrderingFacilityId).HasMaxLength(64).IsRequired();
        builder.Property(p => p.OrderingFacilityName).HasMaxLength(200).IsRequired();
        builder.Property(p => p.PrescriberName).HasMaxLength(200).IsRequired();
        builder.Property(p => p.PrescriberPrcLicense).HasMaxLength(50).IsRequired();
        builder.Property(p => p.Diagnosis).HasMaxLength(500);
        builder.Property(p => p.Instructions).HasMaxLength(1000);
        builder.Property(p => p.Stage).HasConversion<string>().HasMaxLength(30);
        builder.Property(p => p.QuotedAmount).HasPrecision(12, 2);
        builder.Property(p => p.PharmacyName).HasMaxLength(200);
        builder.Property(p => p.ClaimToken).HasMaxLength(2000);
        builder.Property(p => p.VerificationUrl).HasMaxLength(500);
        builder.Property(p => p.ReceiptNumber).HasMaxLength(100);
        builder.Property(p => p.ExternalPharmacyName).HasMaxLength(200);

        builder.HasOne(p => p.Patient)
            .WithMany()
            .HasForeignKey(p => p.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(p => p.Lines)
            .WithOne(l => l.PrescriptionDocument)
            .HasForeignKey(l => l.PrescriptionDocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(p => new { p.PatientId, p.PrescriptionId }).IsUnique();
    }
}

public sealed class LabResultReportConfiguration : IEntityTypeConfiguration<LabResultReport>
{
    public void Configure(EntityTypeBuilder<LabResultReport> builder)
    {
        builder.HasKey(r => r.Id);
        builder.ConfigureAudit();
        builder.Property(r => r.LaboratoryName).HasMaxLength(200).IsRequired();
        builder.Property(r => r.Title).HasMaxLength(300).IsRequired();
        builder.Property(r => r.Impression).HasMaxLength(2000);
        builder.Property(r => r.Source).HasConversion<string>().HasMaxLength(30);
        builder.Property(r => r.Verification).HasConversion<string>().HasMaxLength(20);
        builder.Property(r => r.ReviewedByName).HasMaxLength(200);
        builder.Property(r => r.ReviewedByPrc).HasMaxLength(50);
        builder.Property(r => r.ReviewRemarks).HasMaxLength(1000);
        builder.Property(r => r.FileStorageKey).HasMaxLength(500);
        builder.Property(r => r.FileName).HasMaxLength(260);
        builder.Property(r => r.FileContentType).HasMaxLength(100);

        builder.HasOne(r => r.Patient)
            .WithMany()
            .HasForeignKey(r => r.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(r => r.Observations)
            .WithOne(o => o.Report)
            .HasForeignKey(o => o.LabResultReportId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(r => new { r.PatientId, r.ReportId }).IsUnique();
        builder.HasIndex(r => new { r.PatientId, r.RequisitionId });
    }
}