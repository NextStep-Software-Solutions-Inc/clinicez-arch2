using System;

namespace ClinicEz.Clinic.Application.Features.Settings.DTOs;

public sealed record ClinicSettingsDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string ClinicName,
    string? TaxIdentificationNumber,
    string? AccreditationNumber,
    string OperatingHours,
    int DefaultSlotDurationMinutes,
    string QueuePrefix,
    string InvoicePrefix,
    decimal DefaultConsultationFee,
    decimal VatRate,
    string? LetterheadHeader,
    string? LetterheadSubHeader,
    string? LetterheadAddress,
    string? LetterheadContact,
    string? LetterheadFooter);
