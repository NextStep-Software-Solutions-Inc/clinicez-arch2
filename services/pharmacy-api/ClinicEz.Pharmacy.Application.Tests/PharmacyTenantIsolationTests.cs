using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>Plan 4.9: two tenants' (and two pharmacies of one tenant) data live in one database and must never leak.</summary>
public class PharmacyTenantIsolationTests
{
    private sealed record Site(string Tenant, Guid Pharmacy)
    {
        public string Key => Pharmacy.ToString();
        public TestPharmacyScope Scope() => new(Tenant, Pharmacy);
    }

    private static readonly Site TenantAMain = new("tenant-a", new Guid("aaaaaaaa-0000-0000-0000-000000000001"));
    private static readonly Site TenantBMain = new("tenant-b", new Guid("bbbbbbbb-0000-0000-0000-000000000001"));
    private static readonly Site TenantASecond = new("tenant-a", new Guid("aaaaaaaa-0000-0000-0000-000000000002"));
    private static readonly Site[] Sites = { TenantAMain, TenantBMain, TenantASecond };

    private static async Task SeedSiteAsync(string dbName, Site site, bool includeSoftDeleted = false)
    {
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, site.Scope());

        var item = new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            TenantId = site.Tenant,
            PharmacyId = site.Key,
            Sku = $"SKU-{site.Key}",
            GenericName = "Amlodipine",
            Strength = "5mg",
            DosageForm = "Tablet",
            UnitPrice = site == TenantBMain ? 99m : 8.50m,
            CurrentStock = 10,
            Batches = new List<InventoryBatch>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = site.Tenant,
                    PharmacyId = site.Key,
                    BatchNumber = $"B-{site.Key}",
                    ExpiryDate = DateTime.UtcNow.AddYears(1),
                    QuantityRemaining = 10,
                    Status = BatchStatus.Active
                }
            }
        };
        db.InventoryItems.Add(item);

        var orderId = Guid.NewGuid();
        db.PrescriptionOrders.Add(new PrescriptionOrder
        {
            Id = orderId,
            TenantId = site.Tenant,
            PharmacyId = site.Key,
            OrderingTenantId = "tenant-clinic",
            OrderingFacilityId = "clinic-1",
            ExternalPrescriptionId = Guid.NewGuid(),
            PrescriptionNumber = $"RX-{site.Key}",
            PatientName = "Patient",
            Items = new List<PrescriptionOrderItem>
            {
                new() { Id = Guid.NewGuid(), GenericName = "Amlodipine", Dosage = "5mg", Sig = "daily", QuantityPrescribed = 1 }
            }
        });
        db.DispenseAuditRecords.Add(new DispenseAuditRecord
        {
            Id = Guid.NewGuid(),
            PrescriptionOrderId = orderId,
            PharmacistName = "RPh",
            PharmacistPrcLicense = "PRC-1",
            DispensedAt = DateTime.UtcNow,
            TotalAmount = 1m,
            BatchDeductionsJson = "[]"
        });

        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = site.Tenant,
            PharmacyId = site.Key,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient",
            PhilHealthIdentificationNumber = $"PIN-{site.Key}",
            BenefitYear = "2026"
        };
        ledger.Transactions.Add(new GamotLedgerTransaction
        {
            Id = Guid.NewGuid(),
            TenantId = site.Tenant,
            PharmacyId = site.Key,
            GamotBeneficiaryLedgerId = ledger.Id,
            PrescriptionOrderId = orderId,
            PrescriptionNumber = $"RX-{site.Key}",
            PhilHealthDrugCode = "CODE",
            GenericName = "Amlodipine",
            UniquePrescriptionSecurityCode = "UPSC",
            DispensingPharmacistName = "RPh",
            DispensingPharmacistPrc = "PRC-1",
            HciAccreditationNumber = "HCI-1"
        });
        db.GamotBeneficiaryLedgers.Add(ledger);

        db.PharmacySettings.Add(new PharmacySettings
        {
            Id = Guid.NewGuid(),
            TenantId = site.Tenant,
            PharmacyId = site.Pharmacy,
            PharmacyName = $"Pharmacy {site.Key}"
        });

        var staff = new PharmacyStaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = site.Tenant,
            PharmacyId = site.Pharmacy,
            FirstName = "Sam",
            LastName = "Staff"
        };
        db.PharmacyStaffMembers.Add(staff);
        db.RefreshTokens.Add(new PharmacyRefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            TenantId = site.Tenant,
            PharmacyId = site.Pharmacy,
            TokenHash = $"hash-{site.Key}",
            FamilyId = Guid.NewGuid(),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });

        if (includeSoftDeleted)
        {
            db.PrescriptionOrders.Add(new PrescriptionOrder
            {
                Id = Guid.NewGuid(),
                TenantId = site.Tenant,
                PharmacyId = site.Key,
                ExternalPrescriptionId = Guid.NewGuid(),
                PrescriptionNumber = $"RX-DELETED-{site.Key}",
                PatientName = "Gone",
                IsDeleted = true
            });
            db.InventoryItems.Add(new PharmacyInventoryItem
            {
                Id = Guid.NewGuid(),
                TenantId = site.Tenant,
                PharmacyId = site.Key,
                Sku = $"SKU-DELETED-{site.Key}",
                GenericName = "Removed",
                IsDeleted = true
            });
        }

        await db.SaveChangesAsync();
    }

    private static async Task<string> SeedAllAsync()
    {
        var dbName = $"Pharmacy_Isolation_{Guid.NewGuid()}";
        foreach (var site in Sites)
        {
            await SeedSiteAsync(dbName, site, includeSoftDeleted: true);
        }

        return dbName;
    }

    [Fact]
    public async Task EveryScopedSet_ReturnsOnlyTheCurrentPharmacysRows()
    {
        var dbName = await SeedAllAsync();

        foreach (var site in Sites)
        {
            await using var db = PharmacyTestDbHelper.CreateContext(dbName, site.Scope());

            (await db.PrescriptionOrders.ToListAsync()).Should().ContainSingle()
                .Which.PrescriptionNumber.Should().Be($"RX-{site.Key}");
            (await db.PrescriptionOrderItems.CountAsync()).Should().Be(1);
            (await db.DispenseAuditRecords.CountAsync()).Should().Be(1);
            (await db.InventoryItems.ToListAsync()).Should().ContainSingle()
                .Which.TenantId.Should().Be(site.Tenant);
            (await db.InventoryBatches.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Key);
            (await db.GamotBeneficiaryLedgers.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Key);
            (await db.GamotLedgerTransactions.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Key);
            (await db.PharmacySettings.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Pharmacy);
            (await db.PharmacyStaffMembers.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Pharmacy);
            (await db.RefreshTokens.ToListAsync()).Should().ContainSingle()
                .Which.PharmacyId.Should().Be(site.Pharmacy);
        }
    }

    [Fact]
    public async Task SameTenantOtherPharmacy_IsNotVisible()
    {
        var dbName = await SeedAllAsync();
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, TenantAMain.Scope());

        (await db.PrescriptionOrders.AnyAsync(o => o.PharmacyId == TenantASecond.Key)).Should().BeFalse();
        (await db.InventoryItems.AnyAsync(i => i.PharmacyId == TenantASecond.Key)).Should().BeFalse();
        (await db.PharmacyStaffMembers.AnyAsync(s => s.PharmacyId == TenantASecond.Pharmacy)).Should().BeFalse();
    }

    [Fact]
    public async Task SamePharmacyIdUnderAnotherTenant_IsNotVisible()
    {
        var dbName = await SeedAllAsync();
        var impostor = new Site("tenant-impostor", TenantAMain.Pharmacy);
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, impostor.Scope());

        (await db.PrescriptionOrders.AnyAsync()).Should().BeFalse();
        (await db.InventoryItems.AnyAsync()).Should().BeFalse();
        (await db.PharmacySettings.AnyAsync()).Should().BeFalse();
        (await db.RefreshTokens.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task NoScope_SeesNothing()
    {
        var dbName = await SeedAllAsync();
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, new TestPharmacyScope(string.Empty, Guid.Empty));

        (await db.PrescriptionOrders.AnyAsync()).Should().BeFalse();
        (await db.InventoryItems.AnyAsync()).Should().BeFalse();
        (await db.GamotBeneficiaryLedgers.AnyAsync()).Should().BeFalse();
        (await db.PharmacySettings.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task SoftDeletedRows_AreHidden_UnlessFiltersAreExplicitlyIgnored()
    {
        var dbName = await SeedAllAsync();
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, TenantAMain.Scope());

        (await db.PrescriptionOrders.CountAsync()).Should().Be(1);
        (await db.InventoryItems.CountAsync()).Should().Be(1);

        (await db.PrescriptionOrders.IgnoreQueryFilters().CountAsync()).Should().Be(6, "3 pharmacies x (live + soft-deleted)");
        (await db.InventoryItems.IgnoreQueryFilters().CountAsync()).Should().Be(6);
    }

    [Fact]
    public async Task EnteringAnotherScope_ChangesWhatTheSameContextSees()
    {
        var dbName = await SeedAllAsync();
        var scope = TenantAMain.Scope();
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, scope);

        (await db.InventoryItems.SingleAsync()).UnitPrice.Should().Be(8.50m);

        scope.Enter(TenantBMain.Tenant, TenantBMain.Pharmacy);

        (await db.InventoryItems.SingleAsync()).UnitPrice.Should().Be(99m);
    }

    [Fact]
    public async Task RxIssuedHandler_RunsInTheAddressedPharmacysScope_AndNeverUsesAnotherPharmacysInventory()
    {
        var dbName = await SeedAllAsync();
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        await using var db = PharmacyTestDbHelper.CreateContext(dbName, scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var handler = new PrescriptionIssuedHandler(
            new Repository<PrescriptionOrder>(db, sieve),
            new Repository<PharmacyInventoryItem>(db, sieve),
            new Repository<PharmacySettings>(db, sieve),
            new UnitOfWork(db, sieve, Substitute.For<IProductRepository>()),
            scope,
            NullLogger<PrescriptionIssuedHandler>.Instance);

        var rx = new PrescriptionIssuedEvent
        {
            PrescriptionNumber = "RX-ISOLATION",
            OrderingFacilityName = "Clinic",
            PrescriberDoctor = new PrescriberDoctorDto { DoctorName = "Dr. X", PrcLicenseNumber = "PRC" },
            Patient = new PrescriptionPatientDto { PatientId = Guid.NewGuid(), FullName = "Patient" },
            Items = new List<PrescriptionItemDto> { new() { GenericName = "Amlodipine", Dosage = "5mg", Quantity = 10 } }
        };
        var from = Party.ForFacility("tenant-clinic", Guid.NewGuid().ToString(), FacilityType.Clinic);
        var toA = Party.ForFacility(TenantAMain.Tenant, TenantAMain.Key, FacilityType.Pharmacy);

        await handler.HandleAsync(
            rx,
            new Shared.Interop.Handling.InteropMessageContext(
                InteropEnvelope.Create(InteropTypes.RxIssued, from, toA, rx.PrescriptionId, rx)),
            CancellationToken.None);

        scope.TenantId.Should().Be(TenantAMain.Tenant);
        scope.PharmacyId.Should().Be(TenantAMain.Pharmacy);

        var created = await db.PrescriptionOrders.IgnoreQueryFilters()
            .Include(o => o.Items)
            .SingleAsync(o => o.PrescriptionNumber == "RX-ISOLATION");
        created.TenantId.Should().Be(TenantAMain.Tenant);
        created.PharmacyId.Should().Be(TenantAMain.Key);
        created.Items.Single().UnitPrice.Should().Be(8.50m, "only pharmacy A's own inventory may price the order");

        await using var asB = PharmacyTestDbHelper.CreateContext(dbName, TenantBMain.Scope());
        (await asB.PrescriptionOrders.AnyAsync(o => o.PrescriptionNumber == "RX-ISOLATION")).Should().BeFalse();
        await using var asSecondA = PharmacyTestDbHelper.CreateContext(dbName, TenantASecond.Scope());
        (await asSecondA.PrescriptionOrders.AnyAsync(o => o.PrescriptionNumber == "RX-ISOLATION")).Should().BeFalse();
    }
}
