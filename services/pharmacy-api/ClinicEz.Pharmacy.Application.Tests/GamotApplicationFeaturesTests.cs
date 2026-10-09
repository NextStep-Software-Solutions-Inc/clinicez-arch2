using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Gamot.Commands;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Application.Features.Gamot.Queries;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class GamotApplicationFeaturesTests
{
    private readonly IUpscSecurityService _upscService = new UpscSecurityService("test-only-upsc-secret-key-0123456789abcdef");
    private readonly IGamotFormularyService _formularyService = new GamotFormularyService();

    [Fact]
    public async Task GetGamotFormularyQuery_Should_Return_Formulary_And_Filter_Correctly()
    {
        var handler = new GetGamotFormularyQueryHandler(_formularyService);

        // 1. All items
        var allResult = await handler.Handle(new GetGamotFormularyQuery(), CancellationToken.None);
        allResult.Succeeded.Should().BeTrue();
        allResult.Data.Should().NotBeEmpty();
        allResult.Data!.Count.Should().BeGreaterThanOrEqualTo(20);

        // 2. Filter by Category
        var cardioResult = await handler.Handle(new GetGamotFormularyQuery(Category: "Cardiovascular"), CancellationToken.None);
        cardioResult.Succeeded.Should().BeTrue();
        cardioResult.Data.Should().OnlyContain(x => x.TherapeuticCategory == "Cardiovascular");

        // 3. Filter by Search Term
        var searchResult = await handler.Handle(new GetGamotFormularyQuery(SearchTerm: "Metformin"), CancellationToken.None);
        searchResult.Succeeded.Should().BeTrue();
        searchResult.Data.Should().Contain(x => x.GenericName.Contains("Metformin", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task GenerateUpscCommand_Should_Generate_And_Bind_UPSC_To_Prescription_Item()
    {
        var (context, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(context, sieve);

        var orderId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var order = new PrescriptionOrder
        {
            Id = orderId,
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PrescriptionNumber = "RX-2026-GAMOT-001",
            OrderingFacilityId = "FAC-01",
            OrderingFacilityName = "Quezon City Yakap Clinic",
            OrderingDoctorName = "Dr. Jose Rizal",
            DoctorPrcLicense = "PRC-MED-123456",
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            PhilHealthIdentificationNumber = "12-345678901-2",
            IssuedAt = DateTime.UtcNow,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = itemId,
                    PrescriptionOrderId = orderId,
                    GenericName = "Amlodipine",
                    Dosage = "5mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet once daily",
                    QuantityPrescribed = 30,
                    UnitPrice = 3.00m,
                    Subtotal = 90.00m
                }
            }
        };

        await orderRepo.AddAsync(order, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GenerateUpscCommandHandler(orderRepo, uow, _upscService, _formularyService);
        var command = new GenerateUpscCommand(orderId, itemId, "HCI-QC-999");

        var response = await handler.Handle(command, CancellationToken.None);

        response.Succeeded.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.UniquePrescriptionSecurityCode.Should().StartWith("UPSC-HCIQC999-");
        response.Data.PrescriptionNumber.Should().Be("RX-2026-GAMOT-001");

        // Verify updated entity in DB
        var updatedOrder = await orderRepo.Query(o => o.Id == orderId).Include(o => o.Items).FirstAsync();
        updatedOrder.IsPhilHealthGamot.Should().BeTrue();
        var updatedItem = updatedOrder.Items.First(i => i.Id == itemId);
        updatedItem.UniquePrescriptionSecurityCode.Should().Be(response.Data.UniquePrescriptionSecurityCode);
        updatedItem.IsGamotCovered.Should().BeTrue();
        updatedItem.PhilHealthDrugCode.Should().NotBeNullOrWhiteSpace();
        updatedItem.GamotReferencePrice.Should().Be(0.65m); // Standard Amlodipine 5mg reference price per PhilHealth GAMOT formulary
    }

    [Fact]
    public async Task ValidateUpscQuery_Should_Detect_Valid_Tampered_And_AlreadyDispensed_UPSC()
    {
        var (context, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var ledgerRepo = PharmacyTestDbHelper.CreateRepository<GamotBeneficiaryLedger>(context, sieve);

        var issueDate = DateTime.UtcNow;
        var validUpsc = _upscService.GenerateUpsc(
            hciAccreditationNumber: "HCI-001",
            patientPin: "123456789012",
            prescriptionNumber: "RX-VALID-01",
            doctorPrcLicense: "PRC-001",
            drugCode: "AMLODIPINE5MG00000000000000000",
            quantity: 30,
            issueDate: issueDate);

        var handler = new ValidateUpscQueryHandler(_upscService, ledgerRepo);

        // 1. Valid freshly generated UPSC
        var validResult = await handler.Handle(new ValidateUpscQuery(validUpsc), CancellationToken.None);
        validResult.Succeeded.Should().BeTrue();
        validResult.Data!.IsValid.Should().BeTrue();

        // 2. Tampered checksum
        var tamperedUpsc = validUpsc[..^1] + (validUpsc[^1] == '0' ? '1' : '0');
        var tamperedResult = await handler.Handle(new ValidateUpscQuery(tamperedUpsc), CancellationToken.None);
        tamperedResult.Data!.IsValid.Should().BeFalse();
        tamperedResult.Data.FailureReason.Should().Contain("checksum");

        // 3. Already dispensed UPSC in ledger
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro",
            PhilHealthIdentificationNumber = "123456789012",
            BenefitYear = issueDate.Year.ToString()
        };
        ledger.Debit(
            prescriptionOrderId: Guid.NewGuid(),
            prescriptionOrderItemId: Guid.NewGuid(),
            prescriptionNumber: "RX-VALID-01",
            philHealthDrugCode: "AMLODIPINE5MG00000000000000000",
            genericName: "Amlodipine",
            brandName: null,
            quantity: 30,
            unitPrice: 1.50m,
            upsc: validUpsc,
            pharmacistName: "Pharm",
            pharmacistPrc: "PRC",
            hciAccreditationNumber: "HCI-001");

        await ledgerRepo.AddAsync(ledger, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var dispensedResult = await handler.Handle(new ValidateUpscQuery(validUpsc), CancellationToken.None);
        dispensedResult.Data!.IsValid.Should().BeFalse();
        dispensedResult.Data.FailureReason.Should().Contain("already been dispensed");
    }

    [Fact]
    public async Task DispenseGamotPrescriptionCommand_Should_Deduct_Inventory_Debit_Ledger_And_Publish_Event()
    {
        var (context, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(context, sieve);
        var invRepo = PharmacyTestDbHelper.CreateRepository<PharmacyInventoryItem>(context, sieve);
        var auditRepo = PharmacyTestDbHelper.CreateRepository<DispenseAuditRecord>(context, sieve);
        var ledgerRepo = PharmacyTestDbHelper.CreateRepository<GamotBeneficiaryLedger>(context, sieve);
        var publisher = Substitute.For<IPrescriptionDispensedPublisher>();

        // Setup Inventory with Batches
        var invItem = new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            Sku = "SKU-AMLO-5MG",
            GenericName = "Amlodipine",
            Strength = "5mg",
            DosageForm = "Tablet",
            UnitPrice = 2.00m,
            CurrentStock = 100,
            Batches = new List<InventoryBatch>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    BatchNumber = "BATCH-AMLO-2027",
                    TenantId = PharmacyTestDbHelper.TenantId,
                    PharmacyId = PharmacyTestDbHelper.PharmacyKey,
                    ExpiryDate = DateTime.UtcNow.AddYears(1),
                    QuantityRemaining = 100,
                    Status = BatchStatus.Active,
                    ReceivedDate = DateTime.UtcNow.AddDays(-10)
                }
            }
        };
        await invRepo.AddAsync(invItem, CancellationToken.None);

        // Setup Prescription Order
        var orderId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var order = new PrescriptionOrder
        {
            Id = orderId,
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PrescriptionNumber = "RX-GAMOT-2026-555",
            OrderingTenantId = "tenant-clinic",
            OrderingFacilityId = "FAC-01",
            OrderingFacilityName = "Manila Yakap Clinic",
            OrderingDoctorName = "Dr. Mabini",
            DoctorPrcLicense = "PRC-9999",
            PatientId = Guid.NewGuid(),
            PatientName = "Andres Bonifacio",
            PhilHealthIdentificationNumber = "12-345678901-2",
            IssuedAt = DateTime.UtcNow,
            IsPhilHealthGamot = true,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = itemId,
                    PrescriptionOrderId = orderId,
                    GenericName = "Amlodipine",
                    Dosage = "5mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet daily",
                    QuantityPrescribed = 30,
                    UnitPrice = 2.00m,
                    Subtotal = 60.00m,
                    IsGamotCovered = true,
                    PhilHealthDrugCode = "AMLODIPINE5MG00000000000000000",
                    GamotReferencePrice = 1.50m
                }
            }
        };
        await orderRepo.AddAsync(order, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DispenseGamotPrescriptionCommandHandler(
            orderRepo,
            invRepo,
            auditRepo,
            ledgerRepo,
            uow,
            publisher,
            _upscService,
            _formularyService);

        var command = new DispenseGamotPrescriptionCommand(
            PrescriptionOrderId: orderId,
            PharmacistName: "Lic. Pharmacist Luna",
            PharmacistPrcLicense: "PRC-PH-8888",
            HciAccreditationNumber: "HCI-MNL-001",
            ReceiptNumber: "OR-2026-999",
            Notes: "PhilHealth Yakap GAMOT first dispense");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Status.Should().Be(PrescriptionStatus.Dispensed.ToString());

        // Check Inventory deducted: 100 - 30 = 70
        var updatedInv = await invRepo.Query(i => i.Id == invItem.Id).Include(i => i.Batches).FirstAsync();
        updatedInv.CurrentStock.Should().Be(70);
        updatedInv.Batches.First().QuantityRemaining.Should().Be(70);

        // Check GAMOT Ledger created and debited: 30 * 1.50 = 45.00
        var cleanPin = "00123456789012"[^12..]; // 12-digit padded PIN
        var ledger = await ledgerRepo.Query(l => l.PhilHealthIdentificationNumber == "123456789012").Include(l => l.Transactions).FirstOrDefaultAsync();
        ledger.Should().NotBeNull();
        ledger!.TotalAmountUtilized.Should().Be(45.00m);
        ledger.RemainingBalance.Should().Be(19955.00m);
        ledger.Transactions.Should().ContainSingle();

        // Check audit record created
        var audits = await auditRepo.Query(a => a.PrescriptionOrderId == orderId).ToListAsync();
        audits.Should().ContainSingle();

        // Check event published
        publisher.Received(1).Enqueue(
            Arg.Is<PrescriptionOrder>(o => o.Id == orderId),
            Arg.Is<PrescriptionDispensedEvent>(e => e.PrescriptionNumber == "RX-GAMOT-2026-555"));
    }

    [Fact]
    public async Task ReverseGamotTransactionCommand_Should_Revert_Benefit_And_Order_Status()
    {
        var (context, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(context, sieve);
        var ledgerRepo = PharmacyTestDbHelper.CreateRepository<GamotBeneficiaryLedger>(context, sieve);

        var orderId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var order = new PrescriptionOrder
        {
            Id = orderId,
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PrescriptionNumber = "RX-REV-TEST",
            OrderingFacilityId = "FAC-01",
            OrderingFacilityName = "Yakap Center",
            OrderingDoctorName = "Dr. Rizal",
            DoctorPrcLicense = "PRC-1",
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            PhilHealthIdentificationNumber = "123456789012",
            IssuedAt = DateTime.UtcNow,
            Status = PrescriptionStatus.Dispensed,
            TotalAmount = 100.00m,
            GamotCoverageAmount = 100.00m,
            PatientCoPayAmount = 0.00m,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = itemId,
                    PrescriptionOrderId = orderId,
                    GenericName = "Losartan",
                    Dosage = "50mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet daily",
                    QuantityPrescribed = 50,
                    QuantityDispensed = 50,
                    UnitPrice = 2.00m,
                    Subtotal = 100.00m,
                    Status = ItemDispenseStatus.Dispensed,
                    IsGamotCovered = true
                }
            }
        };
        await orderRepo.AddAsync(order, CancellationToken.None);

        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PatientId = order.PatientId,
            PatientName = order.PatientName,
            PhilHealthIdentificationNumber = "123456789012",
            BenefitYear = DateTime.UtcNow.Year.ToString()
        };

        var txn = ledger.Debit(
            prescriptionOrderId: orderId,
            prescriptionOrderItemId: itemId,
            prescriptionNumber: "RX-REV-TEST",
            philHealthDrugCode: "LOSARTAN5000000000000000000000",
            genericName: "Losartan",
            brandName: null,
            quantity: 50,
            unitPrice: 2.00m,
            upsc: "UPSC-REV-TEST",
            pharmacistName: "Pharm",
            pharmacistPrc: "PRC",
            hciAccreditationNumber: "HCI-01");

        await ledgerRepo.AddAsync(ledger, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReverseGamotTransactionCommandHandler(ledgerRepo, orderRepo, uow);
        var reverseCommand = new ReverseGamotTransactionCommand(
            TransactionId: txn.Id,
            Reason: "Wrong quantity entered by pharmacist",
            ReversedBy: "Supervisor Pharmacist");

        var response = await handler.Handle(reverseCommand, CancellationToken.None);

        response.Succeeded.Should().BeTrue();
        response.Data!.Status.Should().Be(GamotTransactionStatus.Reversed);

        // Check ledger balance restored to PHP 20,000.00
        var updatedLedger = await ledgerRepo.Query(l => l.Id == ledger.Id).Include(l => l.Transactions).FirstAsync();
        updatedLedger.TotalAmountUtilized.Should().Be(0.00m);
        updatedLedger.RemainingBalance.Should().Be(20000.00m);

        // Check prescription item reverted to Pending
        var updatedOrder = await orderRepo.Query(o => o.Id == orderId).Include(o => o.Items).FirstAsync();
        updatedOrder.Status.Should().Be(PrescriptionStatus.Pending);
        updatedOrder.Items.First().Status.Should().Be(ItemDispenseStatus.Pending);
    }

    [Fact]
    public async Task GetGamotLedgerByPinQuery_Should_Return_Full_Allocation_For_New_Patient()
    {
        var (context, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var ledgerRepo = PharmacyTestDbHelper.CreateRepository<GamotBeneficiaryLedger>(context, sieve);
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(context, sieve);

        var handler = new GetGamotLedgerByPinQueryHandler(ledgerRepo, orderRepo);
        var query = new GetGamotLedgerByPinQuery("12-987654321-0");

        var result = await handler.Handle(query, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.AnnualAllocation.Should().Be(20000.00m);
        result.Data.TotalAmountUtilized.Should().Be(0.00m);
        result.Data.RemainingBalance.Should().Be(20000.00m);
        result.Data.Transactions.Should().BeEmpty();
    }
}
