using ClinicEz.Patient.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class PractitionerConfiguration : IEntityTypeConfiguration<Practitioner>
{
    public void Configure(EntityTypeBuilder<Practitioner> builder)
    {
        builder.HasKey(e => e.Id);

        builder.Property(e => e.ProfessionKind).HasMaxLength(30).IsRequired();
        builder.Property(e => e.NormalizedPrcLicenseNo).HasMaxLength(50).IsRequired();
        builder.Property(e => e.DisplayPrcLicenseNo).HasMaxLength(50).IsRequired();
        builder.Property(e => e.VerificationLevel).HasConversion<string>().HasMaxLength(64).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.LastName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.PrimarySpecialty).HasMaxLength(150).IsRequired();
        builder.Property(e => e.Bio).HasMaxLength(2000);
        builder.Property(e => e.AvatarUrl).HasMaxLength(500);

        builder.HasIndex(e => new { e.ProfessionKind, e.NormalizedPrcLicenseNo })
            .HasFilter("merged_into_practitioner_id IS NULL")
            .IsUnique();
        builder.HasIndex(e => e.MergedIntoPractitionerId);
        builder.HasIndex(e => e.VerificationLevel);

        builder.HasMany(e => e.ClinicProviders)
            .WithOne(p => p.Practitioner)
            .HasForeignKey(p => p.PractitionerId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
