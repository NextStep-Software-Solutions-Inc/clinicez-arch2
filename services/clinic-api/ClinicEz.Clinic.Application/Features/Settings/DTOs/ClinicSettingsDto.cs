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
    string? LetterheadFooter,
    string? LicenseToken = null,
    string? PlanTier = "Community",
    int MaxStaffLimit = 5,
    DateTime? LicenseExpiresAt = null,
    string? PmccNumber = null,
    string? SoftwareCertificateId = null,
    string? KonsultaEndpoint = "/soap/konsulta",
    bool IsPhilHealthConfigured = false,
    string PrimaryColorHex = "#0284C7",
    string? PrimaryLogoUrl = null,
    string PaperSize = "Letter");

