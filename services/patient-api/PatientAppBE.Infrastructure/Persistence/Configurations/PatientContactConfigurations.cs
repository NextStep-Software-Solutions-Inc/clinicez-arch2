using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Infrastructure.Persistence.Configurations;

public sealed class PatientGovernmentIdConfiguration : IEntityTypeConfiguration<PatientGovernmentId>
{
    public void Configure(EntityTypeBuilder<PatientGovernmentId> builder)
    {
        builder.HasKey(g => g.Id);
        builder.Property(g => g.IdNumber).HasMaxLength(100).IsRequired();
        builder.Property(g => g.IdType).HasConversion<string>().HasMaxLength(30);
        builder.Property(g => g.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(g => g.UpdatedBy).HasMaxLength(128);

        builder.HasOne(g => g.Patient)
            .WithMany(p => p.GovernmentIds)
            .HasForeignKey(g => g.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(g => new { g.PatientId, g.IdType });
    }
}

public sealed class PatientAddressConfiguration : IEntityTypeConfiguration<PatientAddress>
{
    public void Configure(EntityTypeBuilder<PatientAddress> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Type).HasConversion<string>().HasMaxLength(20);
        builder.Property(a => a.HouseStreet).HasMaxLength(200);
        builder.Property(a => a.Barangay).HasMaxLength(100);
        builder.Property(a => a.CityMunicipality).HasMaxLength(100);
        builder.Property(a => a.Province).HasMaxLength(100);
        builder.Property(a => a.Region).HasMaxLength(100);
        builder.Property(a => a.ZipCode).HasMaxLength(10);
        builder.Property(a => a.Country).HasMaxLength(80);
        builder.Property(a => a.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(a => a.UpdatedBy).HasMaxLength(128);

        builder.HasOne(a => a.Patient)
            .WithMany(p => p.Addresses)
            .HasForeignKey(a => a.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class EmergencyContactConfiguration : IEntityTypeConfiguration<EmergencyContact>
{
    public void Configure(EntityTypeBuilder<EmergencyContact> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.FullName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Relationship).HasMaxLength(80);
        builder.Property(e => e.Mobile).HasMaxLength(20);
        builder.Property(e => e.AltPhone).HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);

        builder.HasOne(e => e.Patient)
            .WithMany(p => p.EmergencyContacts)
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
