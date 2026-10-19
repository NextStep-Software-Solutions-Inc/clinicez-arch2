using System;
using System.Collections.Generic;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class GamotBenefitLedgerTests
{
    [Fact]
    public void New_Ledger_Should_Have_Default_Php_20000_Annual_Allocation()
    {
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = "TENANT-001",
            PharmacyId = "PHARM-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            PhilHealthIdentificationNumber = "123456789012",
            BenefitYear = "2026"
        };

        ledger.AnnualAllocation.Should().Be(20000.00m);
        ledger.TotalAmountUtilized.Should().Be(0.00m);
        ledger.RemainingBalance.Should().Be(20000.00m);
        ledger.CanCover(20000.00m).Should().BeTrue();
        ledger.CanCover(20000.01m).Should().BeFalse();
    }

    [Fact]
    public void Debit_Should_Deduct_From_Remaining_Balance_And_Record_Transaction()
    {
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = "TENANT-001",
            PharmacyId = "PHARM-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            PhilHealthIdentificationNumber = "987654321012",
            BenefitYear = "2026"
        };

        var txn = ledger.Debit(
            prescriptionOrderId: Guid.NewGuid(),
            prescriptionOrderItemId: Guid.NewGuid(),
            prescriptionNumber: "RX-2026-001",
            philHealthDrugCode: "AMLODIPINE5MG00000000000000000",
            genericName: "Amlodipine",
            brandName: "Norvasc",
            quantity: 30,
            unitPrice: 1.50m,
            upsc: "UPSC-HCI01-20261003-ABCDEF-5",
            pharmacistName: "Lic. Pharmacist Santos",
            pharmacistPrc: "PRC-PH-112233",
            hciAccreditationNumber: "HCI-001");

        txn.Should().NotBeNull();
        txn.TotalGamotAmount.Should().Be(45.00m); // 30 * 1.50
        txn.Status.Should().Be(GamotTransactionStatus.Dispensed);

        ledger.TotalAmountUtilized.Should().Be(45.00m);
        ledger.RemainingBalance.Should().Be(19955.00m);
        ledger.Transactions.Should().ContainSingle();
    }

    [Fact]
    public void Debit_Should_Throw_InvalidOperationException_When_Exceeding_Balance()
    {
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = "TENANT-001",
            PharmacyId = "PHARM-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            PhilHealthIdentificationNumber = "111222333444",
            BenefitYear = "2026",
            TotalAmountUtilized = 19900.00m // Only 100.00 left
        };

        ledger.RemainingBalance.Should().Be(100.00m);

        var act = () => ledger.Debit(
            prescriptionOrderId: Guid.NewGuid(),
            prescriptionOrderItemId: Guid.NewGuid(),
            prescriptionNumber: "RX-OVER",
            philHealthDrugCode: "EXPENSIVE-DRUG",
            genericName: "Special Med",
            brandName: null,
            quantity: 10,
            unitPrice: 20.00m, // 200.00 > 100.00
            upsc: "UPSC-000",
            pharmacistName: "Pharmacist",
            pharmacistPrc: "PRC-00",
            hciAccreditationNumber: "HCI-00");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Insufficient PhilHealth GAMOT benefit balance*");
    }

    [Fact]
    public void ReverseTransaction_Should_Restore_Balance_And_Mark_Status()
    {
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            TenantId = "TENANT-001",
            PharmacyId = "PHARM-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Gabriela Silang",
            PhilHealthIdentificationNumber = "555666777888",
            BenefitYear = "2026"
        };

        var txn = ledger.Debit(
            prescriptionOrderId: Guid.NewGuid(),
            prescriptionOrderItemId: Guid.NewGuid(),
            prescriptionNumber: "RX-REV-01",
            philHealthDrugCode: "METFORMIN500000000000000000000",
            genericName: "Metformin",
            brandName: null,
            quantity: 100,
            unitPrice: 2.00m, // 200.00
            upsc: "UPSC-REV-TEST",
            pharmacistName: "Pharmacist A",
            pharmacistPrc: "PRC-01",
            hciAccreditationNumber: "HCI-01");

        ledger.TotalAmountUtilized.Should().Be(200.00m);
        ledger.RemainingBalance.Should().Be(19800.00m);

        ledger.ReverseTransaction(txn.Id, "Patient cancellation request");

        txn.Status.Should().Be(GamotTransactionStatus.Reversed);
        txn.Notes.Should().Contain("Reversed: Patient cancellation request");
        ledger.TotalAmountUtilized.Should().Be(0.00m);
        ledger.RemainingBalance.Should().Be(20000.00m);

        // Attempting to reverse again should throw
        var reverseAgain = () => ledger.ReverseTransaction(txn.Id, "Duplicate attempt");
        reverseAgain.Should().Throw<InvalidOperationException>()
            .WithMessage("*already been reversed*");
    }

    [Fact]
    public void ReverseTransaction_Should_Throw_KeyNotFoundException_When_Id_Does_Not_Exist()
    {
        var ledger = new GamotBeneficiaryLedger
        {
            Id = Guid.NewGuid(),
            PatientName = "Test",
            PhilHealthIdentificationNumber = "123",
            BenefitYear = "2026"
        };

        var act = () => ledger.ReverseTransaction(Guid.NewGuid(), "Non-existent");
        act.Should().Throw<KeyNotFoundException>();
    }
}
