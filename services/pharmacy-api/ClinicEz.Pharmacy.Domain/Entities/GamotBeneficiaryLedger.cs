using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class GamotBeneficiaryLedger : BaseEntity
{
    public const decimal DefaultAnnualAllocation = 20000.00m; // PHP 20,000.00 per PhilHealth expanded GAMOT outpatient benefit policy

    public GamotBeneficiaryLedger() { }

    public string TenantId { get; set; } = string.Empty;
    public string PharmacyId { get; set; } = string.Empty;

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public required string PhilHealthIdentificationNumber { get; set; }
    public string? MemberPhilHealthIdentificationNumber { get; set; }
    public required string BenefitYear { get; set; }

    public decimal AnnualAllocation { get; set; } = DefaultAnnualAllocation;
    public decimal TotalAmountUtilized { get; set; } = 0.00m;

    public decimal RemainingBalance => Math.Max(0.00m, AnnualAllocation - TotalAmountUtilized);

    public ICollection<GamotLedgerTransaction> Transactions { get; set; } = new List<GamotLedgerTransaction>();

    public bool CanCover(decimal amount) => RemainingBalance >= amount;

    public GamotLedgerTransaction Debit(
        Guid prescriptionOrderId,
        Guid? prescriptionOrderItemId,
        string prescriptionNumber,
        string philHealthDrugCode,
        string genericName,
        string? brandName,
        int quantity,
        decimal unitPrice,
        string upsc,
        string pharmacistName,
        string pharmacistPrc,
        string hciAccreditationNumber,
        decimal patientCoPay = 0.00m)
    {
        var totalAmount = quantity * unitPrice;
        if (totalAmount > RemainingBalance)
        {
            throw new InvalidOperationException(
                $"Insufficient PhilHealth GAMOT benefit balance. Required: PHP {totalAmount:F2}, Available: PHP {RemainingBalance:F2}.");
        }

        var transaction = new GamotLedgerTransaction
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            PharmacyId = PharmacyId,
            GamotBeneficiaryLedgerId = Id,
            PrescriptionOrderId = prescriptionOrderId,
            PrescriptionOrderItemId = prescriptionOrderItemId,
            PrescriptionNumber = prescriptionNumber,
            TransactionDate = DateTime.UtcNow,
            PhilHealthDrugCode = philHealthDrugCode,
            GenericName = genericName,
            BrandName = brandName,
            QuantityDispensed = quantity,
            PhilHealthReferencePrice = unitPrice,
            TotalGamotAmount = totalAmount,
            PatientCoPay = patientCoPay,
            UniquePrescriptionSecurityCode = upsc,
            DispensingPharmacistName = pharmacistName,
            DispensingPharmacistPrc = pharmacistPrc,
            HciAccreditationNumber = hciAccreditationNumber,
            Status = GamotTransactionStatus.Dispensed,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = pharmacistName
        };

        TotalAmountUtilized += totalAmount;
        Transactions.Add(transaction);

        return transaction;
    }

    public void ReverseTransaction(Guid transactionId, string reason)
    {
        var txn = Transactions.FirstOrDefault(t => t.Id == transactionId);
        if (txn == null)
        {
            throw new KeyNotFoundException($"GAMOT transaction with ID '{transactionId}' was not found in this ledger.");
        }

        if (txn.Status == GamotTransactionStatus.Reversed)
        {
            throw new InvalidOperationException("GAMOT transaction has already been reversed.");
        }

        txn.Status = GamotTransactionStatus.Reversed;
        txn.Notes = string.IsNullOrWhiteSpace(txn.Notes)
            ? $"Reversed: {reason}"
            : $"{txn.Notes}; Reversed: {reason}";
        txn.UpdatedAt = DateTime.UtcNow;

        TotalAmountUtilized = Math.Max(0.00m, TotalAmountUtilized - txn.TotalGamotAmount);
    }
}
