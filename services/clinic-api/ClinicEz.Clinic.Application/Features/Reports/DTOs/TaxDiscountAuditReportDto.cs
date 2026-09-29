using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public record TaxDiscountAuditRowDto(
    string InvoiceNumber,
    DateTime InvoiceDate,
    string PatientName,
    string DiscountType,
    string? IdentificationCardNumber, // Senior Citizen ID or PWD ID
    decimal GrossAmount,
    decimal DiscountAmount, // 20% statutory discount
    decimal VatExemptSales, // Net sales subject to 0% VAT
    decimal VatAmountExempted, // 12% VAT exempted under RA 9994 / RA 10754
    decimal NetAmount,
    decimal AmountPaid,
    string? OfficialReceiptNumber,
    string? PaymentMethod
);

public record TaxDiscountAuditReportDto(
    DateTime StartDate,
    DateTime EndDate,
    string TenantId,
    Guid ClinicId,
    int TotalInvoicesAudited,
    decimal TotalGrossSales,
    decimal TotalSeniorDiscounts,
    decimal TotalPwdDiscounts,
    decimal TotalVatExempted,
    decimal TotalNetCollections,
    List<TaxDiscountAuditRowDto> Items
);
