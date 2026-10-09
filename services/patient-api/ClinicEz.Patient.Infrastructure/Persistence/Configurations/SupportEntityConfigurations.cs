using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => e.Slug).IsUnique();
        builder.Property(e => e.Slug).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(1000).IsRequired();
        builder.Property(e => e.LogoUrl).HasMaxLength(500);
        builder.Property(e => e.CoverImageUrl).HasMaxLength(500);
        builder.Property(e => e.AddressHint).HasMaxLength(300);
        builder.Property(e => e.InviteCode).HasMaxLength(50);
        builder.HasIndex(e => e.InviteCode).HasFilter("invite_code IS NOT NULL");
        builder.Property(e => e.PrivacyPolicyUrl).HasMaxLength(500);
        builder.Property(e => e.TermsAndConditionsUrl).HasMaxLength(500);
        builder.Property(e => e.RolesJson).HasColumnType("text").IsRequired();
        builder.Property(e => e.RequiredShareFieldsJson).HasColumnType("text").IsRequired();
        builder.HasIndex(e => e.FeaturedScore);
    }
}

public sealed class ClinicConfiguration : IEntityTypeConfiguration<Clinic>
{
    public void Configure(EntityTypeBuilder<Clinic> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(1000);
        builder.Property(e => e.Address).HasMaxLength(300);
        builder.Property(e => e.TenantId).HasMaxLength(100);
        builder.Property(e => e.LogoUrl).HasMaxLength(500);
        builder.Property(e => e.CoverImageUrl).HasMaxLength(500);
        builder.Property(e => e.PrivacyPolicyUrl).HasMaxLength(500);
        builder.Property(e => e.TermsAndConditionsUrl).HasMaxLength(500);
        builder.Property(e => e.SpecialtiesJson).HasColumnType("text").IsRequired();
        builder.Property(e => e.RequiredShareFieldsJson).HasColumnType("text").IsRequired();
        builder.HasIndex(e => e.FeaturedScore);
    }
}

public sealed class ClinicOrganizationLinkConfiguration : IEntityTypeConfiguration<ClinicOrganizationLink>
{
    public void Configure(EntityTypeBuilder<ClinicOrganizationLink> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.ClinicId, e.OrganizationId }).IsUnique();
        builder.Property(e => e.RelationType).HasMaxLength(30).IsRequired();

        builder.HasOne(e => e.Clinic)
            .WithMany(c => c.OrganizationLinks)
            .HasForeignKey(e => e.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Organization)
            .WithMany(o => o.ClinicLinks)
            .HasForeignKey(e => e.OrganizationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class OrganizationMembershipConfiguration : IEntityTypeConfiguration<OrganizationMembership>
{
    public void Configure(EntityTypeBuilder<OrganizationMembership> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.PatientId, e.OrganizationId }).IsUnique();
        builder.Property(e => e.RoleId).HasMaxLength(50).IsRequired();
        builder.Property(e => e.RoleName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);

        builder.HasOne(e => e.Patient)
            .WithMany(p => p.OrganizationMemberships)
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Organization)
            .WithMany(o => o.Memberships)
            .HasForeignKey(e => e.OrganizationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ClinicMembershipConfiguration : IEntityTypeConfiguration<ClinicMembership>
{
    public void Configure(EntityTypeBuilder<ClinicMembership> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.PatientId, e.ClinicId }).IsUnique();
        builder.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);

        builder.HasOne(e => e.Patient)
            .WithMany(p => p.ClinicMemberships)
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Clinic)
            .WithMany(c => c.Memberships)
            .HasForeignKey(e => e.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BookingDraftConfiguration : IEntityTypeConfiguration<BookingDraft>
{
    public void Configure(EntityTypeBuilder<BookingDraft> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.PreferredTime).HasMaxLength(20);
        builder.Property(e => e.Reason).HasMaxLength(500);
        builder.Property(e => e.Notes).HasMaxLength(1000);
        builder.Property(e => e.ShareFieldsJson).HasColumnType("text").IsRequired();
        builder.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);

        builder.HasOne(e => e.Patient)
            .WithMany(p => p.BookingDrafts)
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Clinic)
            .WithMany(c => c.BookingDrafts)
            .HasForeignKey(e => e.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Organization)
            .WithMany()
            .HasForeignKey(e => e.OrganizationId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(e => new { e.PatientId, e.Status });
    }
}

public sealed class NotificationPreferencesConfiguration : IEntityTypeConfiguration<NotificationPreferences>
{
    public void Configure(EntityTypeBuilder<NotificationPreferences> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.PatientId, e.Category }).IsUnique();
        builder.Property(e => e.Category).HasConversion<string>().HasMaxLength(30);
        builder.Property(e => e.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(e => e.UpdatedBy).HasMaxLength(128);
        builder.HasOne(e => e.Patient)
            .WithMany(p => p.NotificationPreferences)
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ClinicHealthcareProviderConfiguration : IEntityTypeConfiguration<ClinicHealthcareProvider>
{
    public void Configure(EntityTypeBuilder<ClinicHealthcareProvider> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Specialty).HasMaxLength(150).IsRequired();
        builder.Property(e => e.AvatarUrl).HasMaxLength(500);
        builder.Property(e => e.ProfessionalLicenseNo).HasMaxLength(50);
        builder.HasIndex(e => new { e.ClinicId, e.IsActive });

        builder.HasOne(e => e.Clinic)
            .WithMany(c => c.HealthcareProviders)
            .HasForeignKey(e => e.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ClinicServiceConfiguration : IEntityTypeConfiguration<ClinicService>
{
    public void Configure(EntityTypeBuilder<ClinicService> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(1000);
        builder.Property(e => e.Price).HasPrecision(18, 2);
        builder.HasIndex(e => new { e.ClinicId, e.IsActive });

        builder.HasOne(e => e.Clinic)
            .WithMany(c => c.Services)
            .HasForeignKey(e => e.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class OrganizationRoleConfiguration : IEntityTypeConfiguration<OrganizationRole>
{
    public void Configure(EntityTypeBuilder<OrganizationRole> builder)
    {
        builder.HasKey(e => e.Id);
        
        // Ensure a specific RoleId is unique per organization
        builder.HasIndex(e => new { e.OrganizationId, e.RoleId }).IsUnique();
        
        builder.Property(e => e.RoleId).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(150).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(500).IsRequired();

        builder.HasOne(e => e.Organization)
            .WithMany(o => o.Roles)
            .HasForeignKey(e => e.OrganizationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

