using System;
using System.Collections.Generic;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;

public sealed record GamotLedgerTransactionDto(
    Guid Id,
    Guid PrescriptionOrderId,
    Guid? PrescriptionOrderItemId,
    string PrescriptionNumber,
    DateTime TransactionDate,
    string PhilHealthDrugCode,
    string GenericName,
    string? BrandName,
    int QuantityDispensed,
    decimal PhilHealthReferencePrice,
    decimal TotalGamotAmount,
    decimal PatientCoPay,
    string UniquePrescriptionSecurityCode,
    string DispensingPharmacistName,
    string DispensingPharmacistPrc,
    string HciAccreditationNumber,
    GamotTransactionStatus Status,
    string? Notes);

public sealed record GamotBeneficiaryLedgerDto(
    Guid Id,
    string PatientName,
    string PhilHealthIdentificationNumber,
    string? MemberPhilHealthIdentificationNumber,
    string BenefitYear,
    decimal AnnualAllocation,
    decimal TotalAmountUtilized,
    decimal RemainingBalance,
    IReadOnlyList<GamotLedgerTransactionDto> Transactions);

public sealed record GamotFormularyDto(
    string DrugCode,
    string GenericName,
    string Dosage,
    string Form,
    string TherapeuticCategory,
    decimal ReferenceUnitPrice,
    bool RequiresSpecialistRecommendation);

public sealed record UpscGenerateResultDto(
    string UniquePrescriptionSecurityCode,
    string PrescriptionNumber,
    string DrugCode,
    DateTime GeneratedAt);

public sealed record UpscVerifyResultDto(
    bool IsValid,
    string? FailureReason,
    string UniquePrescriptionSecurityCode);
