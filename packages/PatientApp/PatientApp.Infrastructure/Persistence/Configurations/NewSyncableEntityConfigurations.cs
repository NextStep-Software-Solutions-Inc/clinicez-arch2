using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PatientApp.Domain.Entities;

namespace PatientApp.Infrastructure.Persistence.Configurations;

public sealed class PatientHealthcareProviderConfiguration : IEntityTypeConfiguration<PatientHealthcareProvider>
{
    public void Configure(EntityTypeBuilder<PatientHealthcareProvider> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ProviderType).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.Name).HasMaxLength(200);
        builder.Property(e => e.Specialty).HasMaxLength(150);
        builder.Property(e => e.ClinicHospital).HasMaxLength(200);
        builder.Property(e => e.Phone).HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.HealthcareProviders).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientImmunizationSelfConfiguration : IEntityTypeConfiguration<PatientImmunizationSelf>
{
    public void Configure(EntityTypeBuilder<PatientImmunizationSelf> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ImmunizationCategory).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.VaccineName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.DoseNumber).HasMaxLength(20);
        builder.Property(e => e.LotNumber).HasMaxLength(50);
        builder.Property(e => e.AdministeredBy).HasMaxLength(200);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.ImmunizationsSelf).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientDisabilityConfiguration : IEntityTypeConfiguration<PatientDisability>
{
    public void Configure(EntityTypeBuilder<PatientDisability> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.BodyPart).HasMaxLength(100);
        builder.Property(e => e.Classification).HasMaxLength(200);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.Disabilities).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientOccupationConfiguration : IEntityTypeConfiguration<PatientOccupation>
{
    public void Configure(EntityTypeBuilder<PatientOccupation> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => e.PatientId).IsUnique();
        builder.Property(e => e.Occupation).HasMaxLength(200);
        builder.Property(e => e.Employer).HasMaxLength(200);
        builder.Property(e => e.Industry).HasMaxLength(200);
        builder.Property(e => e.WorkEnvironment).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.HazardExposure).HasMaxLength(500);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithOne(p => p.Occupation).HasForeignKey<PatientOccupation>(e => e.PatientId);
    }
}

public sealed class PatientTravelHistoryConfiguration : IEntityTypeConfiguration<PatientTravelHistory>
{
    public void Configure(EntityTypeBuilder<PatientTravelHistory> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Destination).HasMaxLength(200).IsRequired();
        builder.Property(e => e.CityProvince).HasMaxLength(200);
        builder.Property(e => e.Purpose).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.IllnessDuringAfterTravel).HasMaxLength(500);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.TravelHistories).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientContraceptiveHistoryConfiguration : IEntityTypeConfiguration<PatientContraceptiveHistory>
{
    public void Configure(EntityTypeBuilder<PatientContraceptiveHistory> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Method).HasMaxLength(200).IsRequired();
        builder.Property(e => e.ReasonForStopping).HasMaxLength(500);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.ContraceptiveHistories).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientPregnancyConfiguration : IEntityTypeConfiguration<PatientPregnancy>
{
    public void Configure(EntityTypeBuilder<PatientPregnancy> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Outcome).HasMaxLength(200);
        builder.Property(e => e.DeliveryType).HasMaxLength(100);
        builder.Property(e => e.Complications).HasMaxLength(500);
        builder.Property(e => e.Facility).HasMaxLength(200);
        builder.Property(e => e.BirthWeightKg).HasPrecision(4, 2);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.Pregnancies).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PatientMaleReproductiveConfiguration : IEntityTypeConfiguration<PatientMaleReproductive>
{
    public void Configure(EntityTypeBuilder<PatientMaleReproductive> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => e.PatientId).IsUnique();
        builder.Property(e => e.Conditions).HasMaxLength(500);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithOne(p => p.MaleReproductive).HasForeignKey<PatientMaleReproductive>(e => e.PatientId);
    }
}

public sealed class PatientDentalVisionConfiguration : IEntityTypeConfiguration<PatientDentalVision>
{
    public void Configure(EntityTypeBuilder<PatientDentalVision> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => e.PatientId).IsUnique();
        builder.Property(e => e.DentistName).HasMaxLength(200);
        builder.Property(e => e.DentistClinic).HasMaxLength(200);
        builder.Property(e => e.OrthodonticDevice).HasMaxLength(100);
        builder.Property(e => e.EyeDoctorName).HasMaxLength(200);
        builder.Property(e => e.CorrectiveLenses).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithOne(p => p.DentalVision).HasForeignKey<PatientDentalVision>(e => e.PatientId);
    }
}

public sealed class FileFolderConfiguration : IEntityTypeConfiguration<FileFolder>
{
    public void Configure(EntityTypeBuilder<FileFolder> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(255).IsRequired();
        builder.Property(e => e.SyncStatus).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.SyncError).HasMaxLength(500);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient).WithMany(p => p.FileFolders).HasForeignKey(e => e.PatientId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.Parent).WithMany(e => e.Children).HasForeignKey(e => e.ParentId).OnDelete(DeleteBehavior.Restrict);
    }
}
