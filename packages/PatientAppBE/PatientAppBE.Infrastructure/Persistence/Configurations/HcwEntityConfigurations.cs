using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Infrastructure.Persistence.Configurations;

public sealed class VaccinationAdministeredConfiguration : IEntityTypeConfiguration<VaccinationAdministered>
{
    public void Configure(EntityTypeBuilder<VaccinationAdministered> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.VaccineName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.DiseaseTargeted).HasMaxLength(200);
        builder.Property(e => e.DoseNumber).HasMaxLength(20);
        builder.Property(e => e.LotBatchNumber).HasMaxLength(50);
        builder.Property(e => e.AdministeredBy).HasMaxLength(200);
        builder.Property(e => e.Facility).HasMaxLength(200);
        builder.Property(e => e.Route).HasMaxLength(50);
        builder.Property(e => e.InjectionSite).HasMaxLength(100);
        builder.Property(e => e.AdverseReaction).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.AdverseReactionDescription).HasMaxLength(500);
        builder.Property(e => e.VaccineProgram).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.ServerId).HasMaxLength(128);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.VaccinationsAdministered).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => new { e.PatientId, e.DateAdministered });
    }
}

public sealed class ClinicalAssessmentConfiguration : IEntityTypeConfiguration<ClinicalAssessment>
{
    public void Configure(EntityTypeBuilder<ClinicalAssessment> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.AssessmentType).HasConversion<string>().HasMaxLength(40);
        builder.Property(e => e.AssessedBy).HasMaxLength(200);
        builder.Property(e => e.ScoresJson).HasColumnType("text");
        builder.Property(e => e.FindingsJson).HasColumnType("text");
        builder.Property(e => e.ServerId).HasMaxLength(128);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.ClinicalAssessments).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientPhysicalExamProfileConfiguration : IEntityTypeConfiguration<PatientPhysicalExamProfile>
{
    public void Configure(EntityTypeBuilder<PatientPhysicalExamProfile> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.GenSurveyId).HasMaxLength(50);
        builder.Property(e => e.GenSurveyRem).HasMaxLength(500);
        builder.Property(e => e.SkinRem).HasMaxLength(500);
        builder.Property(e => e.HeentRem).HasMaxLength(500);
        builder.Property(e => e.ChestRem).HasMaxLength(500);
        builder.Property(e => e.HeartRem).HasMaxLength(500);
        builder.Property(e => e.AbdomenRem).HasMaxLength(500);
        builder.Property(e => e.NeuroRem).HasMaxLength(500);
        builder.Property(e => e.RectalRem).HasMaxLength(500);
        builder.Property(e => e.GuRem).HasMaxLength(500);
        foreach (var col in new[] { nameof(PatientPhysicalExamProfile.SkinId), nameof(PatientPhysicalExamProfile.HeentId), nameof(PatientPhysicalExamProfile.ChestId), nameof(PatientPhysicalExamProfile.HeartId), nameof(PatientPhysicalExamProfile.AbdomenId), nameof(PatientPhysicalExamProfile.NeuroId), nameof(PatientPhysicalExamProfile.GuId), nameof(PatientPhysicalExamProfile.RectalId) })
            builder.Property(col).HasMaxLength(500);
        builder.Property(e => e.ServerId).HasMaxLength(128);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.PhysicalExamProfiles).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => new { e.PatientId, e.ExamDate });
    }
}

public sealed class PatientNcdQuestionnaireConfiguration : IEntityTypeConfiguration<PatientNcdQuestionnaire>
{
    public void Configure(EntityTypeBuilder<PatientNcdQuestionnaire> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => e.PatientId).IsUnique();
        foreach (var col in new[] { "Qid1Yn","Qid2Yn","Qid3Yn","Qid4Yn","Qid5Ynx","Qid6Yn","Qid7Yn","Qid8Yn","Qid9Yn","Qid10Yn","Qid11Yn","Qid12Yn","Qid13Yn","Qid14Yn","Qid15Yn","Qid16Yn","Qid17Abcde","Qid18Yn","Qid19Yn","Qid20Yn","Qid21Yn","Qid22Yn","Qid23Yn","Qid24Yn" })
            builder.Property(col).HasMaxLength(5);
        builder.Property(e => e.Qid19FbsMgdl).HasPrecision(6, 2);
        builder.Property(e => e.Qid19FbsMmol).HasPrecision(5, 2);
        builder.Property(e => e.Qid20CholeVal).HasPrecision(6, 2);
        builder.Property(e => e.Qid21KetonVal).HasPrecision(5, 2);
        builder.Property(e => e.Qid22ProteinVal).HasPrecision(5, 2);
        builder.Property(e => e.ServerId).HasMaxLength(128);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithOne(p => p.NcdQuestionnaire).HasForeignKey<PatientNcdQuestionnaire>(e => e.PatientId);
    }
}
