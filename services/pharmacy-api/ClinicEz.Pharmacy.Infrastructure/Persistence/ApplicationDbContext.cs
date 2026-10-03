using ClinicEz.Pharmacy.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using MassTransit;

namespace ClinicEz.Pharmacy.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, Microsoft.Extensions.Configuration.IConfiguration configuration) : DbContext(options)
{
    public DbSet<Product> Products { get; set; }
    public DbSet<PharmacyInventoryItem> InventoryItems { get; set; }
    public DbSet<InventoryBatch> InventoryBatches { get; set; }
    public DbSet<PrescriptionOrder> PrescriptionOrders { get; set; }
    public DbSet<PrescriptionOrderItem> PrescriptionOrderItems { get; set; }
    public DbSet<DispenseAuditRecord> DispenseAuditRecords { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }
        modelBuilder.HasDefaultSchema(schemaName);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entity.FindProperty("Id");
            if (idProperty == null) continue;

            if (entity.FindPrimaryKey() == null)
            {
                if (idProperty.ClrType == typeof(Guid))
                {
                    idProperty.SetDefaultValueSql("gen_random_uuid()");
                }
                entity.SetPrimaryKey(idProperty);
                idProperty.ValueGenerated = ValueGenerated.OnAdd;
            }
        }

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.Entity<PharmacyInventoryItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.BrandName).HasMaxLength(255);
            entity.Property(e => e.DosageForm).HasMaxLength(100);
            entity.Property(e => e.Strength).HasMaxLength(100);
            entity.Property(e => e.UnitCost).HasPrecision(18, 2);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);

            entity.HasMany(e => e.Batches)
                .WithOne(b => b.InventoryItem)
                .HasForeignKey(b => b.InventoryItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InventoryBatch>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.BatchNumber).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<PrescriptionOrder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PrescriptionNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.OrderingDoctorName).HasMaxLength(255);
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);

            entity.HasMany(e => e.Items)
                .WithOne(i => i.PrescriptionOrder)
                .HasForeignKey(i => i.PrescriptionOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.DispenseRecords)
                .WithOne(d => d.PrescriptionOrder)
                .HasForeignKey(d => d.PrescriptionOrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PrescriptionOrderItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Dosage).IsRequired().HasMaxLength(100);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);
            entity.Property(e => e.Subtotal).HasPrecision(18, 2);
        });

        modelBuilder.Entity<DispenseAuditRecord>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PharmacistName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PharmacistPrcLicense).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
        });

        modelBuilder.AddInboxStateEntity();
        modelBuilder.AddOutboxStateEntity();
        modelBuilder.AddOutboxMessageEntity();

        base.OnModelCreating(modelBuilder);
    }
}
