using Microsoft.EntityFrameworkCore;
using ClinicEz.PhilHealthProxy.Domain.Entities;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Persistence;

public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<PhilHealthTenant> PhilHealthTenants => Set<PhilHealthTenant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<PhilHealthTenant>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.TenantId).IsUnique();
            entity.Property(e => e.FacilityName).HasMaxLength(200).IsRequired();
            entity.Property(e => e.AccreditationNumber).HasMaxLength(50).IsRequired();
            entity.Property(e => e.PmccNumber).HasMaxLength(20).IsRequired();
            entity.Property(e => e.SoftwareCertificateId).HasMaxLength(100).IsRequired();
            entity.Property(e => e.EncryptedUsername).IsRequired();
            entity.Property(e => e.EncryptedPassword).IsRequired();
            entity.Property(e => e.EncryptedCipherKey).IsRequired();
            entity.Property(e => e.KonsultaEndpoint).HasMaxLength(500).IsRequired();
        });
    }
}
