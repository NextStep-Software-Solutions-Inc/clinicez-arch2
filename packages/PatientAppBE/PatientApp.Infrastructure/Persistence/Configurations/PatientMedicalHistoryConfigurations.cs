using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PatientApp.Domain.Entities;

namespace PatientApp.Infrastructure.Persistence.Configurations;

public sealed class PatientAllergyConfiguration : IEntityTypeConfiguration<PatientAllergy>
{
    public void Configure(EntityTypeBuilder<PatientAllergy> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.AllergenName).HasMaxLength(200).IsRequired();
        builder.Property(a => a.AllergyType).HasConversion<string>().HasMaxLength(30);
        builder.Property(a => a.Severity).HasConversion<string>().HasMaxLength(30);
        builder.Property(a => a.Reaction).HasMaxLength(500);
        builder.Property(a => a.Notes).HasMaxLength(1000);
        builder.Property(a => a.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(a => a.UpdatedBy).HasMaxLength(128);

        builder.HasOne(a => a.Patient)
            .WithMany(p => p.Allergies)
            .HasForeignKey(a => a.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientMedicationConfiguration : IEntityTypeConfiguration<PatientMedication>
{
    public void Configure(EntityTypeBuilder<PatientMedication> builder)
    {
        builder.HasKey(m => m.Id);
        builder.Property(m => m.MedicationName).HasMaxLength(200).IsRequired();
        builder.Property(m => m.GenericName).HasMaxLength(200);
        builder.Property(m => m.Dosage).HasMaxLength(100);
        builder.Property(m => m.Frequency).HasMaxLength(100);
        builder.Property(m => m.Route).HasMaxLength(80);
        builder.Property(m => m.PrescribedBy).HasMaxLength(200);
        builder.Property(m => m.Purpose).HasMaxLength(500);
        builder.Property(m => m.Notes).HasMaxLength(1000);
        builder.Property(m => m.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(m => m.UpdatedBy).HasMaxLength(128);

        builder.HasOne(m => m.Patient)
            .WithMany(p => p.Medications)
            .HasForeignKey(m => m.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientSurgicalHistoryConfiguration : IEntityTypeConfiguration<PatientSurgicalHistory>
{
    public void Configure(EntityTypeBuilder<PatientSurgicalHistory> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.ProcedureName).HasMaxLength(300).IsRequired();
        builder.Property(s => s.SurgeonName).HasMaxLength(200);
        builder.Property(s => s.Hospital).HasMaxLength(200);
        builder.Property(s => s.AnesthesiaType).HasMaxLength(80);
        builder.Property(s => s.Complications).HasMaxLength(1000);
        builder.Property(s => s.Notes).HasMaxLength(1000);
        builder.Property(s => s.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(s => s.UpdatedBy).HasMaxLength(128);

        builder.HasOne(s => s.Patient)
            .WithMany(p => p.SurgicalHistories)
            .HasForeignKey(s => s.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientPastIllnessConfiguration : IEntityTypeConfiguration<PatientPastIllness>
{
    public void Configure(EntityTypeBuilder<PatientPastIllness> builder)
    {
        builder.HasKey(i => i.Id);
        builder.Property(i => i.IllnessName).HasMaxLength(300).IsRequired();
        builder.Property(i => i.TreatmentReceived).HasMaxLength(500);
        builder.Property(i => i.Notes).HasMaxLength(1000);
        builder.Property(i => i.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(i => i.UpdatedBy).HasMaxLength(128);

        builder.HasOne(i => i.Patient)
            .WithMany(p => p.PastIllnesses)
            .HasForeignKey(i => i.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientChronicConditionConfiguration : IEntityTypeConfiguration<PatientChronicCondition>
{
    public void Configure(EntityTypeBuilder<PatientChronicCondition> builder)
    {
        builder.HasKey(c => c.Id);
        builder.Property(c => c.ConditionName).HasMaxLength(300).IsRequired();
        builder.Property(c => c.TreatmentNotes).HasMaxLength(1000);
        builder.Property(c => c.CurrentMedications).HasMaxLength(500);
        builder.Property(c => c.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(c => c.UpdatedBy).HasMaxLength(128);

        builder.HasOne(c => c.Patient)
            .WithMany(p => p.ChronicConditions)
            .HasForeignKey(c => c.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientFamilyHistoryConfiguration : IEntityTypeConfiguration<PatientFamilyHistory>
{
    public void Configure(EntityTypeBuilder<PatientFamilyHistory> builder)
    {
        builder.HasKey(f => f.Id);
        builder.Property(f => f.ConditionName).HasMaxLength(300).IsRequired();
        builder.Property(f => f.Relation).HasConversion<string>().HasMaxLength(30);
        builder.Property(f => f.Notes).HasMaxLength(1000);
        builder.Property(f => f.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(f => f.UpdatedBy).HasMaxLength(128);

        builder.HasOne(f => f.Patient)
            .WithMany(p => p.FamilyHistories)
            .HasForeignKey(f => f.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
