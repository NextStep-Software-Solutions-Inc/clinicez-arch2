using System;
using System.Linq;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Documents;
using ClinicEz.Shared.Documents.Components;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Documents.Security;
using Microsoft.Extensions.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class ClinicDocumentPdfService : IClinicDocumentPdfService
{
    private readonly IDocumentSecurityService _securityService;
    private readonly IQrCodeService _qrCodeService;
    private readonly string _verificationBaseUrl;

    public ClinicDocumentPdfService(
        IDocumentSecurityService? securityService = null,
        IQrCodeService? qrCodeService = null,
        IConfiguration? configuration = null)
    {
        QuestPdfInitializer.EnsureInitialized();
        _securityService = securityService ?? new DocumentSecurityService();
        _qrCodeService = qrCodeService ?? new QrCodeService();
        _verificationBaseUrl = VerificationUrlResolver.Resolve(configuration);
    }

    public byte[] GenerateMedicalCertificatePdf(MedicalCertificate cert, ClinicSettings settings, ClinicPatient? patient = null)
    {
        var config = MapToTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedDateTime = cert.SignedAt ?? cert.CreatedAt;
        var digest = _securityService.ComputeDocumentDigest(
            cert.TenantId,
            "MED-CERT",
            cert.CertificateNumber,
            cert.PatientId,
            cert.PrcLicenseNumber,
            issuedDateTime);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "med-cert",
            cert.CertificateNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

        var patientAge = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 35;
        var patientGender = patient?.Gender.ToString() ?? "Patient";

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(config.PaperSize switch
                {
                    DocumentPaperSize.A4 => PageSizes.A4,
                    DocumentPaperSize.A5 => PageSizes.A5,
                    _ => PageSizes.Letter
                });

                page.Margin(config.PageMarginMm, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(9.5f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(6).Column(col =>
                {
                    // Certificate Title Banner
                    col.Item().AlignCenter().Column(c =>
                    {
                        c.Item().Text("OFFICIAL MEDICAL CERTIFICATE")
                            .FontSize(15).Bold().FontColor(primaryColor);
                        c.Item().Text($"Document No: {cert.CertificateNumber} • Date Issued: {cert.IssueDate:MMMM dd, yyyy}")
                            .FontSize(8.5f).SemiBold().FontColor("#6B7280");
                    });

                    // Formal Salutation
                    col.Item().PaddingTop(18).Text("TO WHOM IT MAY CONCERN:").FontSize(11).Bold().FontColor("#111827");

                    // Clinical Certification Narrative
                    col.Item().PaddingTop(10).Text(t =>
                    {
                        t.DefaultTextStyle(x => x.LineHeight(1.4f));
                        t.Span("This is to certify that ");
                        t.Span(cert.PatientName).Bold().FontColor("#111827");
                        t.Span($", {patientAge} years of age, {patientGender}, was physically examined and clinically evaluated at this medical facility on ");
                        t.Span(cert.IssueDate.ToString("MMMM dd, yyyy")).SemiBold();
                        t.Span(" with the following medical findings:");
                    });

                    // Diagnosis & Findings Card
                    col.Item().PaddingTop(12).Border(1).BorderColor("#CBD5E1").Background("#F8FAFC").Padding(10).Column(c =>
                    {
                        c.Item().Text(t =>
                        {
                            t.Span("Clinical Diagnosis: ").Bold().FontColor("#0F172A");
                            t.Span(cert.Diagnosis).Bold().FontColor(primaryColor);
                        });

                        if (!string.IsNullOrWhiteSpace(cert.ClinicalFindings))
                        {
                            c.Item().PaddingTop(4).Text(t =>
                            {
                                t.Span("Clinical Findings: ").SemiBold().FontColor("#334155");
                                t.Span(cert.ClinicalFindings).FontColor("#1E293B");
                            });
                        }
                    });

                    // Fitness Status & Rest Recommendation Card
                    col.Item().PaddingTop(10).Border(1).BorderColor("#86EFAC").Background("#F0FDF4").Padding(10).Column(c =>
                    {
                        c.Item().Text(t =>
                        {
                            t.Span("Fitness Status: ").Bold().FontColor("#166534");
                            t.Span(cert.FitnessStatus.ToUpperInvariant()).Bold().FontColor("#15803D");
                        });

                        if (cert.RecommendedRestDays > 0)
                        {
                            c.Item().PaddingTop(3).Text(t =>
                            {
                                t.Span("Recommended Medical Rest: ").SemiBold().FontColor("#166534");
                                t.Span($"{cert.RecommendedRestDays} day(s)").Bold().FontColor("#111827");

                                if (cert.RestStartDate.HasValue && cert.RestEndDate.HasValue)
                                {
                                    t.Span($" (from {cert.RestStartDate:MMM dd, yyyy} to {cert.RestEndDate:MMM dd, yyyy})");
                                }
                            });
                        }
                    });

                    // Purpose & Remarks
                    col.Item().PaddingTop(10).Column(c =>
                    {
                        c.Item().Text(t =>
                        {
                            t.Span("Purpose: ").SemiBold().FontColor("#4B5563");
                            t.Span($"Issued upon patient request for {cert.Purpose} purposes.").FontColor("#1F2937");
                        });

                        if (!string.IsNullOrWhiteSpace(cert.Remarks))
                        {
                            c.Item().PaddingTop(3).Text(t =>
                            {
                                t.Span("Remarks: ").SemiBold().FontColor("#4B5563");
                                t.Span(cert.Remarks).FontColor("#1F2937");
                            });
                        }
                    });

                    // Doctor Signature & Stamp Box
                    col.Item().PaddingTop(25).AlignRight().Column(c =>
                    {
                        c.Item().Width(220).Column(stamp =>
                        {
                            stamp.Item().Height(35); // Signature area
                            stamp.Item().LineHorizontal(1).LineColor("#111827");
                            stamp.Item().PaddingTop(4).AlignCenter().Text(cert.DoctorName).FontSize(11).Bold().FontColor("#111827");
                            stamp.Item().AlignCenter().Text("Attending Physician").FontSize(8.5f).SemiBold().FontColor("#4B5563");
                            stamp.Item().AlignCenter().Text($"PRC Lic. No.: {cert.PrcLicenseNumber}").FontSize(8).FontColor("#4B5563");
                            if (!string.IsNullOrWhiteSpace(cert.PtrNumber))
                                stamp.Item().AlignCenter().Text($"PTR No.: {cert.PtrNumber}").FontSize(8).FontColor("#4B5563");
                            stamp.Item().PaddingTop(2).AlignCenter().Text("✓ Digitally Certified & Locked").FontSize(7.5f).Bold().FontColor("#16A34A");
                        });
                    });
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateLabRequisitionSlipPdf(LabOrderSlipDto slip, ClinicSettings settings)
    {
        var config = MapToTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var digest = _securityService.ComputeDocumentDigest(
            settings.TenantId,
            "LAB-SLIP",
            slip.OrderNumber,
            slip.PatientId,
            slip.DoctorPrcLicense,
            slip.OrderDate);

        var qrBytes = _qrCodeService.GenerateQrCodePng(slip.QrPayload ?? $"CLINICEZ:REQ:{slip.OrderNumber}:{slip.PublicUploadToken}", 4);

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(config.PaperSize switch
                {
                    DocumentPaperSize.A4 => PageSizes.A4,
                    DocumentPaperSize.A5 => PageSizes.A5,
                    _ => PageSizes.Letter
                });

                page.Margin(config.PageMarginMm, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(9).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Requisition Title
                    col.Item().AlignCenter().Column(c =>
                    {
                        c.Item().Text("OFFICIAL DIAGNOSTIC REQUISITION SLIP")
                            .FontSize(14).Bold().FontColor(primaryColor);
                        c.Item().Text($"Order No: {slip.OrderNumber} • Date: {slip.OrderDate:yyyy-MM-dd HH:mm}")
                            .FontSize(8.5f).SemiBold().FontColor("#6B7280");
                    });

                    // Attending Doctor & Patient Demographics Grid
                    col.Item().PaddingTop(10).Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t =>
                            {
                                t.Span("Patient: ").SemiBold().FontColor("#64748B");
                                t.Span(slip.PatientName).Bold().FontColor("#0F172A");
                            });
                            c.Item().Text(t =>
                            {
                                t.Span("Age / Sex: ").SemiBold().FontColor("#64748B");
                                t.Span($"{slip.PatientAge} y • {slip.PatientGender}").FontColor("#1E293B");
                            });
                            if (!string.IsNullOrWhiteSpace(slip.PhilHealthNumber))
                            {
                                c.Item().Text(t =>
                                {
                                    t.Span("PhilHealth PIN: ").SemiBold().FontColor("#64748B");
                                    t.Span(slip.PhilHealthNumber).FontColor("#1E293B");
                                });
                            }
                            if (!string.IsNullOrWhiteSpace(slip.ClinicalDiagnosis))
                            {
                                c.Item().Text(t =>
                                {
                                    t.Span("Diagnosis: ").SemiBold().FontColor("#64748B");
                                    t.Span(slip.ClinicalDiagnosis).Bold().FontColor(primaryColor);
                                });
                            }
                        });

                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t =>
                            {
                                t.Span("Requesting Physician: ").SemiBold().FontColor("#64748B");
                                t.Span(slip.DoctorName).Bold().FontColor("#0F172A");
                            });
                            c.Item().Text(t =>
                            {
                                t.Span("PRC License: ").SemiBold().FontColor("#64748B");
                                t.Span(slip.DoctorPrcLicense).FontColor("#1E293B");
                            });
                            if (!string.IsNullOrWhiteSpace(slip.DoctorPtr))
                            {
                                c.Item().Text(t =>
                                {
                                    t.Span("PTR No.: ").SemiBold().FontColor("#64748B");
                                    t.Span(slip.DoctorPtr).FontColor("#1E293B");
                                });
                            }
                        });
                    });

                    // Fasting & Preparation Instructions if present
                    if (!string.IsNullOrWhiteSpace(slip.FastingInstructions))
                    {
                        col.Item().PaddingTop(8).Border(1).BorderColor("#FDE68A").Background("#FEFCE8").Padding(6).Row(row =>
                        {
                            row.ConstantItem(18).Text("⚠️").FontSize(10);
                            row.RelativeItem().Text(t =>
                            {
                                t.Span("Preparation / Fasting Instructions: ").Bold().FontColor("#92400E");
                                t.Span(slip.FastingInstructions).FontColor("#78350F");
                            });
                        });
                    }

                    // Requested Diagnostic Tests Table
                    col.Item().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(30);
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(3);
                        });

                        table.Header(h =>
                        {
                            h.Cell().Background("#F1F5F9").Padding(5).Text("#").FontSize(8).Bold().FontColor("#334155");
                            h.Cell().Background("#F1F5F9").Padding(5).Text("REQUESTED TEST / PANEL").FontSize(8).Bold().FontColor("#334155");
                            h.Cell().Background("#F1F5F9").Padding(5).Text("CATEGORY").FontSize(8).Bold().FontColor("#334155");
                            h.Cell().Background("#F1F5F9").Padding(5).Text("SPECIMEN / INSTRUCTIONS").FontSize(8).Bold().FontColor("#334155");
                        });

                        int idx = 1;
                        foreach (var item in slip.Items)
                        {
                            table.Cell().BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(5).Text($"{idx++}").FontSize(8.5f);
                            table.Cell().BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(5).Text(item.TestName).FontSize(9).Bold().FontColor("#0F172A");
                            table.Cell().BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(5).Text(item.Category).FontSize(8.5f).FontColor("#475569");
                            table.Cell().BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(5).Text(item.Instructions ?? "Standard diagnostic protocol").FontSize(8f).FontColor("#64748B");
                        }
                    });

                    // Universal Patient Choice & Dropzone Interoperability Box
                    col.Item().PaddingTop(12).Border(1).BorderColor("#BAE6FD").Background("#F0F9FF").Padding(8).Row(row =>
                    {
                        row.ConstantItem(60).Height(60).Image(qrBytes);
                        row.RelativeItem().PaddingLeft(10).Column(c =>
                        {
                            c.Item().Text("UNIVERSAL PATIENT CHOICE (DUAL-PATH INTEROPERABILITY)")
                                .FontSize(9).Bold().FontColor("#0369A1");
                            c.Item().Text("Present this official slip to ANY laboratory (ClinicEz partner or accredited external diagnostic center e.g. Hi-Precision, Quest, Hospital Lab).")
                                .FontSize(7.5f).FontColor("#334155");
                            c.Item().PaddingTop(2).Text($"Dropzone Upload Link: {slip.PublicUploadUrl} • Token: {slip.PublicUploadToken}")
                                .FontSize(7f).SemiBold().FontColor("#0284C7");
                        });
                    });

                    // Doctor Stamp Block
                    col.Item().PaddingTop(20).AlignRight().Column(c =>
                    {
                        c.Item().Width(200).Column(stamp =>
                        {
                            stamp.Item().Height(30);
                            stamp.Item().LineHorizontal(1).LineColor("#111827");
                            stamp.Item().PaddingTop(3).AlignCenter().Text(slip.DoctorName).FontSize(9.5f).Bold().FontColor("#111827");
                            stamp.Item().AlignCenter().Text($"PRC: {slip.DoctorPrcLicense} • Requesting Physician").FontSize(7.5f).FontColor("#4B5563");
                        });
                    });
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GeneratePrescriptionPdf(PrescriptionSlipDto slip, ClinicSettings settings)
    {
        var config = MapToTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var digest = _securityService.ComputeDocumentDigest(
            settings.TenantId,
            "PRESCRIPTION",
            slip.PrescriptionNumber,
            slip.PatientId,
            slip.DoctorPrcLicense,
            slip.IssuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "rx",
            slip.PrescriptionNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(slip.QrPayload ?? verifyUrl, 4);

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(config.PaperSize switch
                {
                    DocumentPaperSize.A4 => PageSizes.A4,
                    DocumentPaperSize.A5 => PageSizes.A5,
                    _ => PageSizes.Letter
                });

                page.Margin(config.PageMarginMm, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(9).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Prominent Rx Symbol & Header Row
                    col.Item().Row(row =>
                    {
                        row.ConstantItem(40).Text("℞").FontSize(28).Bold().FontColor(primaryColor);
                        row.RelativeItem().PaddingLeft(6).Column(c =>
                        {
                            c.Item().Text("PHILIPPINE ELECTRONIC PRESCRIPTION SLIP")
                                .FontSize(13).Bold().FontColor(primaryColor);
                            c.Item().Text($"Rx No: {slip.PrescriptionNumber} • Date Issued: {slip.IssuedAt:MMMM dd, yyyy}")
                                .FontSize(8.5f).SemiBold().FontColor("#64748B");
                        });
                    });

                    // Patient & Physician Details Box
                    col.Item().PaddingTop(8).Border(1).BorderColor("#CBD5E1").Background("#F8FAFC").Padding(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t =>
                            {
                                t.Span("Patient: ").SemiBold().FontColor("#64748B");
                                t.Span(slip.PatientName).Bold().FontColor("#0F172A");
                            });
                            c.Item().Text(t =>
                            {
                                t.Span("Age / Sex: ").SemiBold().FontColor("#64748B");
                                t.Span($"{slip.PatientAge} y • {slip.PatientGender}").FontColor("#1E293B");
                            });
                            if (!string.IsNullOrWhiteSpace(slip.PhilHealthNumber))
                            {
                                c.Item().Text(t =>
                                {
                                    t.Span("PhilHealth PIN: ").SemiBold().FontColor("#64748B");
                                    t.Span(slip.PhilHealthNumber).FontColor("#1E293B");
                                });
                            }
                            if (!string.IsNullOrWhiteSpace(slip.ClinicalDiagnosis))
                            {
                                c.Item().Text(t =>
                                {
                                    t.Span("Diagnosis: ").SemiBold().FontColor("#64748B");
                                    t.Span(slip.ClinicalDiagnosis).Bold().FontColor(primaryColor);
                                });
                            }
                        });

                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t =>
                            {
                                t.Span("Physician: ").SemiBold().FontColor("#64748B");
                                t.Span(slip.DoctorName).Bold().FontColor("#0F172A");
                            });
                            c.Item().Text($"Specialty: {slip.DoctorSpecialization ?? "General Practice"}").FontSize(8).FontColor("#475569");
                            c.Item().Text($"PRC License: {slip.DoctorPrcLicense} • PTR: {slip.DoctorPtr ?? "N/A"}").FontSize(8).FontColor("#475569");
                            if (!string.IsNullOrWhiteSpace(slip.DoctorS2License))
                            {
                                c.Item().Text($"PDEA S2 License: {slip.DoctorS2License}").FontSize(8).Bold().FontColor("#DC2626");
                            }
                        });
                    });

                    // Allergies Alert Box
                    if (!string.IsNullOrWhiteSpace(slip.PatientAllergies))
                    {
                        col.Item().PaddingTop(6).Border(1).BorderColor("#FECACA").Background("#FEF2F2").Padding(6)
                            .Text($"⚠️ PATIENT ALLERGIES: {slip.PatientAllergies}").FontSize(8.5f).Bold().FontColor("#DC2626");
                    }

                    // Prescribed Medications Title (RA 6675 Generics Act)
                    col.Item().PaddingTop(10).Row(row =>
                    {
                        row.RelativeItem().Text("MEDICATIONS PRESCRIBED").FontSize(10).Bold().FontColor("#0F172A");
                        row.ConstantItem(180).AlignRight()
                            .Text("RA 6675 Generics Act Compliant").FontSize(7.5f).Bold().FontColor("#166534");
                    });

                    // Medication Items List
                    col.Item().PaddingTop(4).Column(itemsCol =>
                    {
                        int medIdx = 1;
                        foreach (var item in slip.Items)
                        {
                            itemsCol.Item().PaddingBottom(6).Border(1).BorderColor("#E2E8F0").Background("#FFFFFF").Padding(8).Column(medCard =>
                            {
                                medCard.Item().Row(r =>
                                {
                                    r.RelativeItem().Text(t =>
                                    {
                                        t.Span($"{medIdx++}. ").Bold();
                                        t.Span(item.GenericName.ToUpperInvariant()).FontSize(11).Bold().FontColor("#0F172A");
                                        if (!string.IsNullOrWhiteSpace(item.BrandName))
                                        {
                                            t.Span($" ({item.BrandName})").FontSize(9.5f).SemiBold().FontColor("#475569");
                                        }
                                    });

                                    r.ConstantItem(75).AlignRight()
                                        .Text($"Qty: {item.Quantity}").FontSize(9.5f).Bold().FontColor(primaryColor);
                                });

                                medCard.Item().PaddingTop(2).Text($"{item.Dosage} • {item.Form}").FontSize(8.5f).SemiBold().FontColor("#334155");

                                medCard.Item().PaddingTop(4).BorderLeft(2).BorderColor(primaryColor).PaddingLeft(6).Text(t =>
                                {
                                    t.Span("Sig: ").Bold().FontColor("#64748B");
                                    t.Span(item.Sig).SemiBold().FontColor("#0F172A");
                                });

                                var refillText = $"Refills allowed: {item.Refills}" + (item.DurationDays > 0 ? $" • Duration: {item.DurationDays} days" : "");
                                medCard.Item().PaddingTop(3).Row(r =>
                                {
                                    r.RelativeItem().Text(refillText).FontSize(7.5f).FontColor("#64748B");
                                    if (item.IsDangerousDrug)
                                    {
                                        r.ConstantItem(130).AlignRight().Text("⚠️ Dangerous Drug (PDEA S2)").FontSize(7.5f).Bold().FontColor("#DC2626");
                                    }
                                });

                                if (!string.IsNullOrWhiteSpace(item.Remarks))
                                {
                                    medCard.Item().PaddingTop(2).Text($"Instructions: {item.Remarks}").FontSize(7.5f).Italic().FontColor("#475569");
                                }
                            });
                        }
                    });

                    // Senior Citizen / PWD 20% Discount ID Box
                    col.Item().PaddingTop(6).Border(1).BorderColor("#CBD5E1").Padding(6).Row(row =>
                    {
                        row.RelativeItem().Text("Senior Citizen / PWD ID No: ______________________  OSCA/PWD Booklet Ref: ______________________").FontSize(7.5f).FontColor("#64748B");
                    });

                    // Physician Signature Stamp
                    col.Item().PaddingTop(18).AlignRight().Column(c =>
                    {
                        c.Item().Width(210).Column(stamp =>
                        {
                            stamp.Item().Height(30);
                            stamp.Item().LineHorizontal(1).LineColor("#111827");
                            stamp.Item().PaddingTop(3).AlignCenter().Text(slip.DoctorName).FontSize(9.5f).Bold().FontColor("#111827");
                            stamp.Item().AlignCenter().Text($"PRC: {slip.DoctorPrcLicense} • PTR: {slip.DoctorPtr ?? "N/A"}").FontSize(7.5f).FontColor("#4B5563");
                            if (!string.IsNullOrWhiteSpace(slip.DoctorS2License))
                            {
                                stamp.Item().AlignCenter().Text($"PDEA S2: {slip.DoctorS2License}").FontSize(7.5f).Bold().FontColor("#DC2626");
                            }
                            stamp.Item().PaddingTop(2).AlignCenter().Text("✓ Officially Signed e-Prescription (FDA Circular 2020-004)").FontSize(7f).Bold().FontColor("#16A34A");
                        });
                    });
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateReferralLetterPdf(
        ReferralLetter referral,
        ClinicSettings settings,
        ClinicPatient? patient = null,
        StaffMember? doctor = null)
    {
        var config = MapToTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var urgencyColor = referral.Urgency?.Trim().ToLowerInvariant() switch
        {
            "emergency" => "#DC2626",
            "urgent" => "#EA580C",
            _ => primaryColor
        };

        var issuedDateTime = referral.SignedAt ?? referral.CreatedAt;
        var prcLicense = doctor?.PrcLicenseNumber ?? "PRC-DOCTOR";

        var digest = _securityService.ComputeDocumentDigest(
            referral.TenantId,
            "REFERRAL",
            referral.ReferralNumber,
            referral.PatientId,
            prcLicense,
            issuedDateTime);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "referral",
            referral.ReferralNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

        var patientAge = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 35;
        var patientGender = patient?.Gender.ToString() ?? "Patient";

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(config.PaperSize switch
                {
                    DocumentPaperSize.A4 => PageSizes.A4,
                    DocumentPaperSize.A5 => PageSizes.A5,
                    _ => PageSizes.Letter
                });

                page.Margin(config.PageMarginMm, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(9f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(6).Column(col =>
                {
                    // Referral Header Banner
                    col.Item().AlignCenter().Column(c =>
                    {
                        c.Item().Text("OFFICIAL CLINICAL REFERRAL LETTER")
                            .FontSize(14).Bold().FontColor(primaryColor);
                        c.Item().Text($"Ref No: {referral.ReferralNumber} • Date: {referral.ReferralDate:MMMM dd, yyyy} • Urgency: {(referral.Urgency ?? "Routine").ToUpperInvariant()}")
                            .FontSize(8.5f).SemiBold().FontColor(urgencyColor);
                    });

                    // Target Facility / Department Box
                    col.Item().PaddingTop(10).Border(1).BorderColor("#CBD5E1").Background("#F8FAFC").Padding(8).Column(c =>
                    {
                        c.Item().Text(t =>
                        {
                            t.Span("REFERRED TO: ").Bold().FontColor("#111827");
                            t.Span(referral.ReferredToFacility).Bold().FontColor(primaryColor);
                        });
                        c.Item().Text(t =>
                        {
                            t.Span("DEPARTMENT / SERVICE: ").SemiBold().FontColor("#4B5563");
                            t.Span(referral.ReferredDepartment).SemiBold().FontColor("#111827");
                            t.Span("  •  ATTENDING SPECIALIST: ").SemiBold().FontColor("#4B5563");
                            t.Span(referral.ReferredToDoctor ?? "Consultant On-Duty / Specialist").FontColor("#111827");
                        });
                    });

                    // Patient Information Strip
                    col.Item().PaddingTop(10).Border(1).BorderColor("#E2E8F0").Background("#FFFFFF").Padding(8).Row(row =>
                    {
                        row.RelativeItem(2).Column(c =>
                        {
                            c.Item().Text("PATIENT NAME").FontSize(7.5f).Bold().FontColor("#6B7280");
                            c.Item().Text(referral.PatientName).FontSize(10f).Bold().FontColor("#111827");
                        });
                        row.RelativeItem(1).Column(c =>
                        {
                            c.Item().Text("AGE / SEX").FontSize(7.5f).Bold().FontColor("#6B7280");
                            c.Item().Text($"{patientAge}y • {patientGender}").FontSize(9.5f).SemiBold().FontColor("#111827");
                        });
                        row.RelativeItem(1.5f).Column(c =>
                        {
                            c.Item().Text("PHILHEALTH PIN").FontSize(7.5f).Bold().FontColor("#6B7280");
                            c.Item().Text(patient?.PhilHealthNumber ?? "N/A").FontSize(9.5f).FontColor("#111827");
                        });
                    });

                    // Clinical Transfer Details
                    col.Item().PaddingTop(10).Column(c =>
                    {
                        // Provisional Diagnosis
                        c.Item().Border(1).BorderColor("#E0E7FF").Background("#EEF2FF").Padding(8).Column(box =>
                        {
                            box.Item().Text("PROVISIONAL DIAGNOSIS / IMPRESSION").FontSize(8f).Bold().FontColor("#3730A3");
                            box.Item().PaddingTop(2).Text(referral.ProvisionalDiagnosis).FontSize(10f).Bold().FontColor("#1E1B4B");
                        });

                        // Reason for Referral
                        c.Item().PaddingTop(8).Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(8).Column(box =>
                        {
                            box.Item().Text("REASON FOR REFERRAL").FontSize(8f).Bold().FontColor("#4B5563");
                            box.Item().PaddingTop(2).Text(referral.ReasonForReferral).FontSize(9f).FontColor("#111827");
                        });

                        // Clinical Summary
                        c.Item().PaddingTop(8).Border(1).BorderColor("#E2E8F0").Background("#FFFFFF").Padding(8).Column(box =>
                        {
                            box.Item().Text("CLINICAL SUMMARY & HISTORY OF PRESENT ILLNESS").FontSize(8f).Bold().FontColor("#4B5563");
                            box.Item().PaddingTop(2).Text(referral.ClinicalSummary).FontSize(9f).FontColor("#111827");
                        });

                        // Medications & Diagnostics Grid
                        c.Item().PaddingTop(8).Row(grid =>
                        {
                            grid.RelativeItem().Border(1).BorderColor("#E2E8F0").Background("#F9FAFB").Padding(6).Column(m =>
                            {
                                m.Item().Text("CURRENT MEDICATIONS").FontSize(7.5f).Bold().FontColor("#4B5563");
                                m.Item().PaddingTop(2).Text(referral.CurrentMedications ?? "None reported").FontSize(8.5f).FontColor("#1F2937");
                            });

                            grid.Spacing(8);

                            grid.RelativeItem().Border(1).BorderColor("#E2E8F0").Background("#F9FAFB").Padding(6).Column(d =>
                            {
                                d.Item().Text("ATTACHED DIAGNOSTICS / LABS").FontSize(7.5f).Bold().FontColor("#4B5563");
                                d.Item().PaddingTop(2).Text(referral.AttachedDiagnostics ?? "None attached").FontSize(8.5f).FontColor("#1F2937");
                            });
                        });
                    });

                    // Referring Physician Stamp & Signature Block
                    col.Item().PaddingTop(16).AlignRight().Width(240).Column(stamp =>
                    {
                        stamp.Item().AlignCenter().Text(referral.ReferringDoctorName)
                            .FontSize(11).Bold().FontColor("#111827");
                        stamp.Item().AlignCenter().Text("Referring Physician / Attending Clinician")
                            .FontSize(8f).Italic().FontColor("#4B5563");
                        stamp.Item().PaddingTop(2).AlignCenter().Text($"PRC License No: {doctor?.PrcLicenseNumber ?? prcLicense}")
                            .FontSize(8f).SemiBold().FontColor("#374151");

                        if (!string.IsNullOrWhiteSpace(doctor?.PtrNumber))
                        {
                            stamp.Item().AlignCenter().Text($"PTR No: {doctor.PtrNumber}").FontSize(8f).FontColor("#4B5563");
                        }
                        if (!string.IsNullOrWhiteSpace(doctor?.S2LicenseNumber))
                        {
                            stamp.Item().AlignCenter().Text($"PDEA S2: {doctor.S2LicenseNumber}").FontSize(8f).Bold().FontColor("#DC2626");
                        }

                        stamp.Item().PaddingTop(3).AlignCenter().Text("✓ Officially Certified Clinical Referral & Transfer")
                            .FontSize(7.5f).Bold().FontColor("#16A34A");
                    });
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    private static TenantPrintoutConfig MapToTenantConfig(ClinicSettings settings)
    {
        return new TenantPrintoutConfig
        {
            FacilityName = settings.LetterheadHeader ?? settings.ClinicName,
            FacilitySubHeader = settings.LetterheadSubHeader ?? "Accredited Outpatient Medical Facility",
            PhysicalAddress = settings.LetterheadAddress ?? "Philippines",
            ContactNumbers = settings.LetterheadContact,
            PhilHealthAccreditationNumber = settings.AccreditationNumber,
            PrimaryColorHex = settings.PrimaryColorHex ?? "#0284C7",
            PaperSize = settings.PaperSize?.ToLowerInvariant() switch
            {
                "a4" => DocumentPaperSize.A4,
                "a5" => DocumentPaperSize.A5,
                _ => DocumentPaperSize.Letter
            },
            CustomDisclaimerText = settings.LetterheadFooter ?? "Valid Philippine Medical Certificate & Prescription. Digitally issued via ClinicEZ in compliance with RA 8792 & RA 10173."
        };
    }
}
