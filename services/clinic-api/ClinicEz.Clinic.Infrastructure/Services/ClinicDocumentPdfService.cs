using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Documents;
using ClinicEz.Shared.Documents.Components;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Workspace;
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
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public ClinicDocumentPdfService(
        IDocumentSecurityService? securityService = null,
        IQrCodeService? qrCodeService = null,
        IConfiguration? configuration = null,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _workspaceProfiles = workspaceProfiles;
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

        var qrBytes = _qrCodeService.GenerateQrCodePng(slip.QrPayload, 4);

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
                            c.Item().PaddingTop(2).Text($"Dropzone Upload Link: {slip.PublicUploadUrl}")
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

    public byte[] GenerateReceptionPlacardPdf(
        ClinicSettings settings,
        string qrUrl,
        string? joinCode = null,
        string? expiresAtFormatted = null)
    {
        var config = MapToTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();
        var effectiveJoinCode = !string.IsNullOrWhiteSpace(joinCode) ? joinCode.Trim().ToUpperInvariant() : settings.JoinCode?.Trim().ToUpperInvariant();
        var effectiveQrUrl = !string.IsNullOrWhiteSpace(qrUrl)
            ? qrUrl.Trim()
            : (!string.IsNullOrWhiteSpace(effectiveJoinCode)
                ? $"{_verificationBaseUrl.TrimEnd('/')}/join/{Uri.EscapeDataString(effectiveJoinCode)}"
                : $"{_verificationBaseUrl.TrimEnd('/')}/join/{settings.TenantSlug ?? settings.TenantId}/{settings.FacilitySlug ?? "main"}");

        var qrBytes = _qrCodeService.GenerateQrCodePng(effectiveQrUrl, 10);

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
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(10f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(12).Column(col =>
                {
                    col.Item().Border(2).BorderColor(primaryColor).Background("#FFFFFF").Padding(24).Column(card =>
                    {
                        card.Item().AlignCenter().Text("WALK-IN PATIENT SELF-ENLISTMENT")
                            .FontSize(18).Bold().FontColor(primaryColor);

                        card.Item().PaddingTop(4).AlignCenter()
                            .Text("Point your smartphone camera at the QR code below to register your visit")
                            .FontSize(11).FontColor("#475569");

                        card.Item().PaddingTop(18).AlignCenter().Width(210).Height(210)
                            .Border(1.5f).BorderColor("#CBD5E1").Background("#FFFFFF").Padding(10)
                            .Image(qrBytes).FitArea();

                        if (!string.IsNullOrWhiteSpace(effectiveJoinCode))
                        {
                            card.Item().PaddingTop(16).AlignCenter().Width(240)
                                .Border(1).BorderColor(primaryColor).Background("#F0FDFA").PaddingVertical(10).PaddingHorizontal(16)
                                .Column(pill =>
                                {
                                    pill.Item().AlignCenter().Text("ACCESS PASSCODE")
                                        .FontSize(8.5f).Bold().FontColor(primaryColor);
                                    pill.Item().PaddingTop(2).AlignCenter().Text(effectiveJoinCode)
                                        .FontSize(22).Bold().FontColor("#0F172A");
                                });

                            if (!string.IsNullOrWhiteSpace(expiresAtFormatted))
                            {
                                card.Item().PaddingTop(4).AlignCenter().Text($"Validity: {expiresAtFormatted}")
                                    .FontSize(8.5f).FontColor("#64748B");
                            }
                        }

                        card.Item().PaddingTop(18).Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(16).Column(steps =>
                        {
                            steps.Item().Text("INSTRUCTIONS FOR PATIENTS")
                                .FontSize(9.5f).Bold().FontColor("#334155");
                            steps.Item().PaddingTop(6).Text("1. Scan QR code with your mobile camera or barcode scanner.")
                                .FontSize(10.5f).FontColor("#0F172A");
                            steps.Item().PaddingTop(4).Text("2. Fill in your patient demographics, PhilHealth PIN, and visit reason.")
                                .FontSize(10.5f).FontColor("#0F172A");
                            steps.Item().PaddingTop(4).Text("3. Receive your Queue Ticket pass and proceed to the triage nurse.")
                                .FontSize(10.5f).FontColor("#0F172A");
                        });

                        card.Item().PaddingTop(14).AlignCenter().Text(effectiveQrUrl)
                            .FontSize(9f).FontColor("#64748B");

                        card.Item().PaddingTop(12).LineHorizontal(0.75f).LineColor("#CBD5E1");

                        var footerNote = !string.IsNullOrWhiteSpace(settings.LetterheadContact)
                            ? $"Need assistance? Please approach the clinic reception desk. • Contact: {settings.LetterheadContact}"
                            : "Need assistance? Please approach the clinic reception desk.";

                        card.Item().PaddingTop(10).AlignCenter().Text(footerNote)
                            .FontSize(9.5f).FontColor("#475569");
                    });
                });
            });
        });

        return doc.GeneratePdf();
    }

    // ==========================================
    // STATUTORY & OPERATIONAL REPORT PDF BUILDERS
    // ==========================================

    public byte[] GenerateDailyEodReportPdf(DailyEodReportDto report, ClinicSettings settings, string? preparedByName = null)
    {
        var config = MapToReportTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedAt = DateTime.UtcNow;
        var docNumber = $"EOD-{report.ReportDate:yyyyMMdd}";
        var staffPrc = !string.IsNullOrWhiteSpace(preparedByName) ? preparedByName : "SYSTEM-AUDIT";
        var digest = _securityService.ComputeDocumentDigest(
            report.TenantId,
            "DAILY-EOD",
            docNumber,
            null,
            staffPrc,
            issuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "daily-eod",
            docNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

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

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Banner
                    ComposeReportBanner(col, "OFFICIAL DAILY END-OF-DAY RECONCILIATION REPORT", primaryColor,
                        $"Report Date: {report.ReportDate:MMMM dd, yyyy} • Generated: {issuedAt:yyyy-MM-dd HH:mm UTC} • Prepared By: {staffPrc}");

                    // Patient Census
                    ComposeSectionTitle(col, "PATIENT CENSUS & OPERATIONAL FLOW", primaryColor);
                    col.Item().Row(row =>
                    {
                        ComposeKpiCell(row, "TOTAL CHECKED IN", report.TotalCheckedIn.ToString());
                        ComposeKpiCell(row, "WALK-INS", report.TotalWalkIns.ToString());
                        ComposeKpiCell(row, "APPOINTMENTS", report.TotalAppointments.ToString());
                        ComposeKpiCell(row, "COMPLETED VISITS", report.TotalCompletedVisits.ToString());
                        ComposeKpiCell(row, "WAITING / IN CONSULT", report.TotalWaitingOrInConsultation.ToString());
                    });

                    // Financial Summary
                    ComposeSectionTitle(col, "FINANCIAL RECONCILIATION & CASHIER REMITTANCE", primaryColor);
                    col.Item().Row(row =>
                    {
                        ComposeKpiCell(row, "GROSS BILLED SALES", $"₱{report.TotalGrossAmount:N2}");
                        ComposeKpiCell(row, "TOTAL DISCOUNTS", $"₱{report.TotalDiscountsGiven:N2}", $"Senior: ₱{report.TotalSeniorDiscounts:N2} | PWD: ₱{report.TotalPwdDiscounts:N2}");
                        ComposeKpiCell(row, "PHILHEALTH COVERED", $"₱{report.TotalPhilHealthCovered:N2}");
                        ComposeKpiCell(row, "NET BILLED SALES", $"₱{report.TotalNetAmount:N2}");
                    });
                    col.Item().PaddingTop(4).Row(row =>
                    {
                        ComposeKpiCell(row, "TOTAL COLLECTED", $"₱{report.TotalAmountCollected:N2}");
                        ComposeKpiCell(row, "CASH IN DRAWER", $"₱{report.CashInDrawer:N2}");
                        ComposeKpiCell(row, "UNPAID / PENDING", $"₱{report.TotalUnpaidBalances:N2}");
                    });

                    // Tender Breakdown
                    ComposeSectionTitle(col, "COLLECTIONS BY PAYMENT METHOD", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1.5f);
                            columns.RelativeColumn(2);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "PAYMENT METHOD");
                            TableHeaderCell(h.Cell(), "TRANSACTIONS", alignRight: true);
                            TableHeaderCell(h.Cell(), "AMOUNT COLLECTED", alignRight: true);
                        });

                        var methods = report.CollectionsByMethod ?? new List<PaymentModeSummary>();
                        if (methods.Count == 0)
                        {
                            table.Cell().ColumnSpan(3).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No recorded payment transactions for this day").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            int totalTx = 0;
                            foreach (var m in methods)
                            {
                                totalTx += m.TransactionCount;
                                TableDataCell(table.Cell(), m.Method);
                                TableDataCell(table.Cell(), m.TransactionCount.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), $"₱{m.TotalAmount:N2}", alignRight: true);
                            }

                            // Total row
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).Text("Total Collections").FontSize(8.5f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text(totalTx.ToString()).FontSize(8.5f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{report.TotalAmountCollected:N2}").FontSize(8.5f).Bold().FontColor("#0F172A");
                        }
                    });

                    // Doctor Workload & Clinical Activity
                    ComposeSectionTitle(col, "CLINICAL ACTIVITY & DOCTOR WORKLOADS", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1.5f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "PHYSICIAN / CLINICIAN NAME");
                            TableHeaderCell(h.Cell(), "ENCOUNTERS ATTENDED", alignRight: true);
                        });

                        var workloads = report.DoctorWorkloads ?? new List<DoctorWorkloadSummary>();
                        if (workloads.Count == 0)
                        {
                            table.Cell().ColumnSpan(2).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No doctor clinical activity recorded for this day").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var dw in workloads)
                            {
                                TableDataCell(table.Cell(), dw.DoctorName);
                                TableDataCell(table.Cell(), dw.EncountersCount.ToString(), alignRight: true);
                            }
                        }
                    });

                    col.Item().PaddingTop(4).Row(row =>
                    {
                        ComposeKpiCell(row, "PROCEDURES PERFORMED", report.TotalProceduresPerformed.ToString());
                        ComposeKpiCell(row, "LAB ORDERS ISSUED", report.TotalLabOrdersIssued.ToString());
                        ComposeKpiCell(row, "PRESCRIPTIONS WRITTEN", report.TotalPrescriptionsWritten.ToString());
                        ComposeKpiCell(row, "DANGEROUS DRUGS (S2)", report.TotalDangerousDrugPrescriptions.ToString());
                    });

                    // Sign-off
                    ComposeSignOffBlock(col, staffPrc, "Cashier / Clinic Staff", "Clinic Administrator / Medical Director");
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateMorbidityReportPdf(MorbidityReportDto report, ClinicSettings settings, string? preparedByName = null)
    {
        var config = MapToReportTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedAt = DateTime.UtcNow;
        var docNumber = $"MORB-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}";
        var staffPrc = !string.IsNullOrWhiteSpace(preparedByName) ? preparedByName : "SYSTEM-AUDIT";
        var digest = _securityService.ComputeDocumentDigest(
            report.TenantId,
            "DOH-MORBIDITY",
            docNumber,
            null,
            staffPrc,
            issuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "doh-morbidity",
            docNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

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
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(8.5f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Banner
                    ComposeReportBanner(col, "DEPARTMENT OF HEALTH (DOH) OUTPATIENT MORBIDITY REPORT", primaryColor,
                        $"Reporting Period: {report.StartDate:MMMM dd, yyyy} to {report.EndDate:MMMM dd, yyyy} • Generated: {issuedAt:yyyy-MM-dd HH:mm UTC}");

                    // Stats KPI Cards
                    col.Item().PaddingTop(2).Row(row =>
                    {
                        ComposeKpiCell(row, "FACILITY NAME", report.ClinicName ?? settings.ClinicName);
                        ComposeKpiCell(row, "TOTAL ENCOUNTERS REVIEWED", report.TotalEncountersReviewed.ToString());
                        ComposeKpiCell(row, "TOTAL DIAGNOSES RECORDED", report.TotalDiagnosesRecorded.ToString());
                    });

                    // Multi-page Disease Table
                    ComposeSectionTitle(col, "RANKED MORBIDITY & ICD-10 DEMOGRAPHIC DISTRIBUTION", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(24);   // #
                            columns.ConstantColumn(52);   // ICD-10
                            columns.RelativeColumn(3.5f); // Description
                            columns.RelativeColumn(1f);   // Pedia
                            columns.RelativeColumn(1f);   // Adult
                            columns.RelativeColumn(1f);   // Senior
                            columns.RelativeColumn(0.9f); // Male
                            columns.RelativeColumn(0.9f); // Female
                            columns.RelativeColumn(1.1f); // Total
                            columns.RelativeColumn(1.1f); // % Share
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "#");
                            TableHeaderCell(h.Cell(), "ICD-10");
                            TableHeaderCell(h.Cell(), "DIAGNOSIS / DISEASE DESCRIPTION");
                            TableHeaderCell(h.Cell(), "PEDIA", alignRight: true);
                            TableHeaderCell(h.Cell(), "ADULT", alignRight: true);
                            TableHeaderCell(h.Cell(), "SENIOR", alignRight: true);
                            TableHeaderCell(h.Cell(), "MALE", alignRight: true);
                            TableHeaderCell(h.Cell(), "FEMALE", alignRight: true);
                            TableHeaderCell(h.Cell(), "TOTAL", alignRight: true);
                            TableHeaderCell(h.Cell(), "% SHARE", alignRight: true);
                        });

                        var diseases = report.Diseases ?? new List<MorbidityDiseaseRowDto>();
                        if (diseases.Count == 0)
                        {
                            table.Cell().ColumnSpan(10).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(10).AlignCenter()
                                .Text("No morbidity cases recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var d in diseases)
                            {
                                TableDataCell(table.Cell(), d.Rank.ToString());
                                TableDataCell(table.Cell(), d.Icd10Code, bold: true);
                                TableDataCell(table.Cell(), d.Description);
                                TableDataCell(table.Cell(), d.PediatricCases.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), d.AdultCases.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), d.SeniorCases.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), d.MaleCases.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), d.FemaleCases.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), d.TotalCases.ToString(), alignRight: true, bold: true);
                                TableDataCell(table.Cell(), $"{d.PercentageOfTotal:F1}%", alignRight: true);
                            }
                        }
                    });

                    // Certification
                    col.Item().PaddingTop(12).Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(8).Column(c =>
                    {
                        c.Item().Text("DOH STATUTORY COMPLIANCE CERTIFICATION")
                            .FontSize(8).Bold().FontColor("#334155");
                        c.Item().PaddingTop(2).Text("I hereby certify that the above outpatient morbidity report is a true and correct summary of medical encounters recorded at this facility in compliance with Department of Health statutory reporting guidelines.")
                            .FontSize(7.5f).FontColor("#475569").Italic();
                    });

                    // Sign-off
                    ComposeSignOffBlock(col, staffPrc, "Medical Director / MHO / Attending Physician", "PRC License & Professional Credentials");
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateTaxDiscountAuditReportPdf(TaxDiscountAuditReportDto report, ClinicSettings settings, string? preparedByName = null)
    {
        var config = MapToReportTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedAt = DateTime.UtcNow;
        var docNumber = $"TAX-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}";
        var staffPrc = !string.IsNullOrWhiteSpace(preparedByName) ? preparedByName : "SYSTEM-AUDIT";
        var digest = _securityService.ComputeDocumentDigest(
            report.TenantId,
            "BIR-TAX-AUDIT",
            docNumber,
            null,
            staffPrc,
            issuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "bir-tax-audit",
            docNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

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
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(8f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Banner
                    ComposeReportBanner(col, "BIR STATUTORY TAX & SENIOR/PWD DISCOUNT AUDIT REPORT", primaryColor,
                        $"Audit Period: {report.StartDate:MMMM dd, yyyy} to {report.EndDate:MMMM dd, yyyy} • TIN: {settings.TaxIdentificationNumber ?? "N/A"} • Generated: {issuedAt:yyyy-MM-dd HH:mm UTC}");

                    // Financial Summary KPI Cards
                    col.Item().PaddingTop(2).Row(row =>
                    {
                        ComposeKpiCell(row, "INVOICES AUDITED", report.TotalInvoicesAudited.ToString());
                        ComposeKpiCell(row, "GROSS SALES", $"₱{report.TotalGrossSales:N2}");
                        ComposeKpiCell(row, "SENIOR (RA 9994)", $"₱{report.TotalSeniorDiscounts:N2}");
                        ComposeKpiCell(row, "PWD (RA 10754)", $"₱{report.TotalPwdDiscounts:N2}");
                        ComposeKpiCell(row, "12% VAT EXEMPTED", $"₱{report.TotalVatExempted:N2}");
                        ComposeKpiCell(row, "NET COLLECTIONS", $"₱{report.TotalNetCollections:N2}");
                    });

                    // Multi-page Transaction Detail Table
                    ComposeSectionTitle(col, "STATUTORY DISCOUNT TRANSACTION AUDIT TRAIL", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2.0f); // OR / Invoice No
                            columns.RelativeColumn(1.6f); // Date
                            columns.RelativeColumn(2.4f); // Patient Name
                            columns.RelativeColumn(1.3f); // Disc Type
                            columns.RelativeColumn(1.8f); // ID Number
                            columns.RelativeColumn(1.6f); // Gross
                            columns.RelativeColumn(1.6f); // 20% Disc
                            columns.RelativeColumn(1.6f); // VAT Exempt
                            columns.RelativeColumn(1.6f); // 12% VAT Ex
                            columns.RelativeColumn(1.6f); // Net
                            columns.RelativeColumn(1.6f); // Paid
                            columns.RelativeColumn(1.3f); // Tender
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "INVOICE / OR");
                            TableHeaderCell(h.Cell(), "DATE");
                            TableHeaderCell(h.Cell(), "PATIENT NAME");
                            TableHeaderCell(h.Cell(), "TYPE");
                            TableHeaderCell(h.Cell(), "ID NUMBER");
                            TableHeaderCell(h.Cell(), "GROSS", alignRight: true);
                            TableHeaderCell(h.Cell(), "DISCOUNT", alignRight: true);
                            TableHeaderCell(h.Cell(), "VAT EXEMPT", alignRight: true);
                            TableHeaderCell(h.Cell(), "12% VAT", alignRight: true);
                            TableHeaderCell(h.Cell(), "NET", alignRight: true);
                            TableHeaderCell(h.Cell(), "PAID", alignRight: true);
                            TableHeaderCell(h.Cell(), "TENDER");
                        });

                        var items = report.Items ?? new List<TaxDiscountAuditRowDto>();
                        if (items.Count == 0)
                        {
                            table.Cell().ColumnSpan(12).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(10).AlignCenter()
                                .Text("No statutory discount invoices recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var item in items)
                            {
                                var orNumber = item.OfficialReceiptNumber ?? item.InvoiceNumber;
                                TableDataCell(table.Cell(), orNumber, bold: true);
                                TableDataCell(table.Cell(), item.InvoiceDate.ToString("yyyy-MM-dd"));
                                TableDataCell(table.Cell(), item.PatientName);
                                TableDataCell(table.Cell(), item.DiscountType);
                                TableDataCell(table.Cell(), item.IdentificationCardNumber ?? "-");
                                TableDataCell(table.Cell(), $"₱{item.GrossAmount:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{item.DiscountAmount:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{item.VatExemptSales:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{item.VatAmountExempted:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{item.NetAmount:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{item.AmountPaid:N2}", alignRight: true);
                                TableDataCell(table.Cell(), item.PaymentMethod ?? "-");
                            }
                        }
                    });

                    // Statutory Disclaimer & Certification Block
                    col.Item().PaddingTop(10).Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(8).Column(c =>
                    {
                        c.Item().Text("BIR COMPLIANCE & LEGAL ATTESTATION")
                            .FontSize(8).Bold().FontColor("#334155");
                        c.Item().PaddingTop(2).Text("Certified in accordance with Republic Act No. 9994 (Expanded Senior Citizens Act of 2010), Republic Act No. 10754 (An Act Expanding the Benefits and Privileges of Persons with Disability), and BIR Revenue Regulations. All sales and deductions are supported by registered official invoices and verified government identification cards.")
                            .FontSize(7.5f).FontColor("#475569").Italic();
                    });

                    // Sign-off
                    ComposeSignOffBlock(col, staffPrc, "Chief Accountant / Clinic Cashier", "Authorized BIR Representative / Clinic Admin");
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateDoctorSharesReportPdf(DoctorSharesReportDto report, ClinicSettings settings, string? preparedByName = null)
    {
        var config = MapToReportTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedAt = DateTime.UtcNow;
        var docNumber = $"SHARE-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}";
        var staffPrc = !string.IsNullOrWhiteSpace(preparedByName) ? preparedByName : "SYSTEM-AUDIT";
        var digest = _securityService.ComputeDocumentDigest(
            report.TenantId,
            "DOCTOR-SHARES",
            docNumber,
            null,
            staffPrc,
            issuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "doctor-shares",
            docNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

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
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(8.5f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Banner
                    ComposeReportBanner(col, "PHYSICIAN PROFESSIONAL FEES & FACILITY SHARES SETTLEMENT REPORT", primaryColor,
                        $"Settlement Period: {report.StartDate:MMMM dd, yyyy} to {report.EndDate:MMMM dd, yyyy} • Generated: {issuedAt:yyyy-MM-dd HH:mm UTC}");

                    // Financial Totals KPI Cards
                    col.Item().PaddingTop(2).Row(row =>
                    {
                        ComposeKpiCell(row, "TOTAL ENCOUNTERS", report.TotalClinicEncounters.ToString());
                        ComposeKpiCell(row, "CLINIC GROSS REVENUE", $"₱{report.TotalClinicGrossRevenue:N2}");
                        ComposeKpiCell(row, "PHYSICIAN SHARES", $"₱{report.TotalPhysicianShares:N2}");
                        ComposeKpiCell(row, "FACILITY RETAINED SHARES", $"₱{report.TotalFacilityShares:N2}");
                    });

                    // Multi-page Doctor Breakdown Table
                    ComposeSectionTitle(col, "PHYSICIAN REVENUE ALLOCATION & FACILITY RETENTION BREAKDOWN", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3.0f); // Doctor Name
                            columns.RelativeColumn(1.2f); // Encounters
                            columns.RelativeColumn(1.2f); // Procedures
                            columns.RelativeColumn(2.0f); // Consult Gross
                            columns.RelativeColumn(2.0f); // Proc Gross
                            columns.RelativeColumn(2.2f); // Total Gross
                            columns.RelativeColumn(2.2f); // Doctor Share
                            columns.RelativeColumn(2.2f); // Facility Share
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "PHYSICIAN NAME");
                            TableHeaderCell(h.Cell(), "VISITS", alignRight: true);
                            TableHeaderCell(h.Cell(), "PROCEDURES", alignRight: true);
                            TableHeaderCell(h.Cell(), "CONSULT GROSS", alignRight: true);
                            TableHeaderCell(h.Cell(), "PROC GROSS", alignRight: true);
                            TableHeaderCell(h.Cell(), "TOTAL GROSS", alignRight: true);
                            TableHeaderCell(h.Cell(), "DOCTOR SHARE", alignRight: true);
                            TableHeaderCell(h.Cell(), "FACILITY SHARE", alignRight: true);
                        });

                        var shares = report.DoctorShares ?? new List<DoctorWorkloadDetailDto>();
                        if (shares.Count == 0)
                        {
                            table.Cell().ColumnSpan(8).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(10).AlignCenter()
                                .Text("No physician clinical activity recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            int totalEncounters = 0;
                            int totalProcedures = 0;
                            decimal totalConsultGross = 0;
                            decimal totalProcGross = 0;
                            decimal totalGross = 0;
                            decimal totalDoctorShare = 0;
                            decimal totalFacilityShare = 0;

                            foreach (var s in shares)
                            {
                                totalEncounters += s.TotalEncounters;
                                totalProcedures += s.TotalProceduresAssisted;
                                totalConsultGross += s.TotalConsultationGross;
                                totalProcGross += s.TotalProcedureGross;
                                totalGross += s.TotalGrossGenerated;
                                totalDoctorShare += s.EstimatedPhysicianShare;
                                totalFacilityShare += s.ClinicFacilityShare;

                                TableDataCell(table.Cell(), s.DoctorName, bold: true);
                                TableDataCell(table.Cell(), s.TotalEncounters.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), s.TotalProceduresAssisted.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), $"₱{s.TotalConsultationGross:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{s.TotalProcedureGross:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{s.TotalGrossGenerated:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"₱{s.EstimatedPhysicianShare:N2}", alignRight: true, fontColor: "#047857");
                                TableDataCell(table.Cell(), $"₱{s.ClinicFacilityShare:N2}", alignRight: true, fontColor: "#0369A1");
                            }

                            // Summary / Totals Row
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).Text("Total Settlement").FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text(totalEncounters.ToString()).FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text(totalProcedures.ToString()).FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{totalConsultGross:N2}").FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{totalProcGross:N2}").FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{totalGross:N2}").FontSize(8f).Bold().FontColor("#0F172A");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{totalDoctorShare:N2}").FontSize(8f).Bold().FontColor("#047857");
                            table.Cell().BorderTop(1).BorderColor("#94A3B8").Padding(4).AlignRight().Text($"₱{totalFacilityShare:N2}").FontSize(8f).Bold().FontColor("#0369A1");
                        }
                    });

                    // Settlement Sign-off
                    ComposeSignOffBlock(col, staffPrc, "Clinic Accountant / Finance", "Medical Director / Clinic Administrator");
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateClinicAnalyticsPdf(ClinicAnalyticsDto analytics, ClinicSettings settings, string? preparedByName = null)
    {
        var config = MapToReportTenantConfig(settings);
        var primaryColor = config.GetSafePrimaryColorHex();

        var issuedAt = DateTime.UtcNow;
        var docNumber = $"ANL-{analytics.StartDate:yyyyMMdd}-{analytics.EndDate:yyyyMMdd}";
        var staffPrc = !string.IsNullOrWhiteSpace(preparedByName) ? preparedByName : "SYSTEM-AUDIT";
        var digest = _securityService.ComputeDocumentDigest(
            analytics.TenantId,
            "CLINIC-ANALYTICS",
            docNumber,
            null,
            staffPrc,
            issuedAt);

        var verifyUrl = _securityService.GenerateVerificationUrl(
            _verificationBaseUrl,
            "clinic-analytics",
            docNumber,
            digest);

        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);

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
                page.DefaultTextStyle(x => x.FontFamily("Helvetica").FontSize(8.5f).FontColor("#1F2937"));

                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().PaddingTop(4).Column(col =>
                {
                    // Banner
                    ComposeReportBanner(col, "EXECUTIVE CLINIC ANALYTICS & OPERATIONAL PERFORMANCE REPORT", primaryColor,
                        $"Reporting Period: {analytics.StartDate:MMMM dd, yyyy} to {analytics.EndDate:MMMM dd, yyyy} • Generated: {issuedAt:yyyy-MM-dd HH:mm UTC}");

                    // Operational Flow & Telemetry
                    if (analytics.Flow != null)
                    {
                        ComposeSectionTitle(col, "OPERATIONAL FLOW & PATIENT QUEUE TELEMETRY", primaryColor);
                        col.Item().Row(row =>
                        {
                            ComposeKpiCell(row, "ENCOUNTERS TODAY", analytics.Flow.TotalEncountersToday.ToString());
                            ComposeKpiCell(row, "IN QUEUE NOW", analytics.Flow.InQueueNow.ToString());
                            ComposeKpiCell(row, "IN CONSULTATION", analytics.Flow.InConsultationNow.ToString());
                            ComposeKpiCell(row, "COMPLETED TODAY", analytics.Flow.CompletedToday.ToString());
                            ComposeKpiCell(row, "URGENT TRIAGE", analytics.Flow.UrgentTriageNow.ToString());
                        });

                        col.Item().PaddingTop(3).Row(row =>
                        {
                            ComposeKpiCell(row, "AVG WAIT TIME", $"{analytics.Flow.AverageWaitMinutes:F1} min");
                            ComposeKpiCell(row, "AVG CONSULT TIME", $"{analytics.Flow.AverageConsultMinutes:F1} min");
                            ComposeKpiCell(row, "ROUTINE TRIAGE", analytics.Flow.RoutineCount.ToString());
                            ComposeKpiCell(row, "URGENT TRIAGE", analytics.Flow.UrgentCount.ToString());
                            ComposeKpiCell(row, "EMERGENCY TRIAGE", analytics.Flow.EmergencyCount.ToString());
                        });
                    }

                    // Financial Summary
                    ComposeSectionTitle(col, "EXECUTIVE FINANCIAL PERFORMANCE", primaryColor);
                    col.Item().Row(row =>
                    {
                        ComposeKpiCell(row, "GROSS REVENUE", $"₱{analytics.TotalGrossRevenue:N2}");
                        ComposeKpiCell(row, "NET REVENUE", $"₱{analytics.TotalNetRevenue:N2}");
                        ComposeKpiCell(row, "TOTAL COLLECTIONS", $"₱{analytics.TotalCollections:N2}");
                        ComposeKpiCell(row, "UNPAID BALANCES", $"₱{analytics.TotalUnpaidBalances:N2}");
                        ComposeKpiCell(row, "AVG TICKET SIZE", $"₱{analytics.AverageTicketSize:N2}");
                    });

                    if (analytics.SeniorDiscountsGiven > 0 || analytics.PwdDiscountsGiven > 0)
                    {
                        col.Item().PaddingTop(3).Row(row =>
                        {
                            ComposeKpiCell(row, "SENIOR CITIZEN DISCOUNTS (RA 9994)", $"₱{analytics.SeniorDiscountsGiven:N2}");
                            ComposeKpiCell(row, "PWD DISCOUNTS (RA 10754)", $"₱{analytics.PwdDiscountsGiven:N2}");
                        });
                    }

                    // Daily Revenue Trend
                    ComposeSectionTitle(col, "DAILY REVENUE TREND", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2.5f);
                            columns.RelativeColumn(1.5f);
                            columns.RelativeColumn(2.0f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "DATE");
                            TableHeaderCell(h.Cell(), "PATIENT VISITS", alignRight: true);
                            TableHeaderCell(h.Cell(), "REVENUE COLLECTED", alignRight: true);
                        });

                        var trends = analytics.RevenueTrend ?? new List<DailyTrendPointDto>();
                        if (trends.Count == 0)
                        {
                            table.Cell().ColumnSpan(3).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No daily revenue trend data recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var t in trends)
                            {
                                TableDataCell(table.Cell(), t.DateLabel);
                                TableDataCell(table.Cell(), t.PatientCount.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), $"₱{t.Revenue:N2}", alignRight: true);
                            }
                        }
                    });

                    // Payment Tender Shares
                    ComposeSectionTitle(col, "PAYMENT METHOD & TENDER DISTRIBUTION", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3.0f);
                            columns.RelativeColumn(2.0f);
                            columns.RelativeColumn(1.5f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "PAYMENT METHOD / TENDER");
                            TableHeaderCell(h.Cell(), "TOTAL COLLECTED", alignRight: true);
                            TableHeaderCell(h.Cell(), "SHARE OF COLLECTIONS", alignRight: true);
                        });

                        var tenders = analytics.TenderShares ?? new List<TenderShareDto>();
                        if (tenders.Count == 0)
                        {
                            table.Cell().ColumnSpan(3).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No payment tender data recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var ts in tenders)
                            {
                                TableDataCell(table.Cell(), ts.Method);
                                TableDataCell(table.Cell(), $"₱{ts.TotalAmount:N2}", alignRight: true);
                                TableDataCell(table.Cell(), $"{ts.Percentage:F1}%", alignRight: true);
                            }
                        }
                    });

                    // Top Diagnoses & Services
                    ComposeSectionTitle(col, "TOP OUTPATIENT DIAGNOSES (ICD-10)", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(4.0f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(1.2f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "ICD-10");
                            TableHeaderCell(h.Cell(), "DIAGNOSIS DESCRIPTION");
                            TableHeaderCell(h.Cell(), "CASES", alignRight: true);
                            TableHeaderCell(h.Cell(), "SHARE", alignRight: true);
                        });

                        var diagnoses = analytics.TopDiagnoses ?? new List<MorbidityItemDto>();
                        if (diagnoses.Count == 0)
                        {
                            table.Cell().ColumnSpan(4).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No diagnostic data recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var d in diagnoses)
                            {
                                TableDataCell(table.Cell(), d.Icd10Code, bold: true);
                                TableDataCell(table.Cell(), d.Description);
                                TableDataCell(table.Cell(), d.CaseCount.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), $"{d.PercentageShare:F1}%", alignRight: true);
                            }
                        }
                    });

                    ComposeSectionTitle(col, "TOP CLINICAL PROCEDURES & DIAGNOSTIC SERVICES", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.5f);
                            columns.RelativeColumn(4.0f);
                            columns.RelativeColumn(1.5f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "CATEGORY");
                            TableHeaderCell(h.Cell(), "SERVICE / PROCEDURE NAME");
                            TableHeaderCell(h.Cell(), "QUANTITY ORDERED", alignRight: true);
                        });

                        var services = analytics.TopServices ?? new List<ServiceUsageDto>();
                        if (services.Count == 0)
                        {
                            table.Cell().ColumnSpan(3).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No procedures or diagnostic orders recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var s in services)
                            {
                                TableDataCell(table.Cell(), s.ItemType);
                                TableDataCell(table.Cell(), s.ItemName);
                                TableDataCell(table.Cell(), s.Quantity.ToString(), alignRight: true);
                            }
                        }
                    });

                    // Doctor Workload
                    ComposeSectionTitle(col, "PHYSICIAN WORKLOAD & BILLINGS SUMMARY", primaryColor);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3.0f);
                            columns.RelativeColumn(1.5f);
                            columns.RelativeColumn(2.0f);
                        });

                        table.Header(h =>
                        {
                            TableHeaderCell(h.Cell(), "PHYSICIAN NAME");
                            TableHeaderCell(h.Cell(), "ENCOUNTERS ATTENDED", alignRight: true);
                            TableHeaderCell(h.Cell(), "TOTAL BILLED", alignRight: true);
                        });

                        var docStats = analytics.DoctorStats ?? new List<DoctorStatDto>();
                        if (docStats.Count == 0)
                        {
                            table.Cell().ColumnSpan(3).BorderBottom(0.5f).BorderColor("#E2E8F0").Padding(8).AlignCenter()
                                .Text("No physician billing activity recorded for this period").Italic().FontSize(8.5f).FontColor("#6B7280");
                        }
                        else
                        {
                            foreach (var ds in docStats)
                            {
                                TableDataCell(table.Cell(), ds.DoctorName, bold: true);
                                TableDataCell(table.Cell(), ds.EncountersCount.ToString(), alignRight: true);
                                TableDataCell(table.Cell(), $"₱{ds.TotalBilled:N2}", alignRight: true);
                            }
                        }
                    });

                    // Sign-off
                    ComposeSignOffBlock(col, staffPrc, "Operations / Executive Analyst", "Medical Director / Chief Operating Officer");
                });

                page.Footer().Component(new DocumentFooterComponent(config, qrBytes, digest));
            });
        });

        return doc.GeneratePdf();
    }

    // ==========================================
    // REPORT STYLING & COMPONENT HELPERS
    // ==========================================

    private static void ComposeReportBanner(ColumnDescriptor col, string title, string primaryColor, string metaLine)
    {
        col.Item().AlignCenter().Column(c =>
        {
            c.Item().Text(title).FontSize(13).Bold().FontColor(primaryColor);
            c.Item().PaddingTop(2).Text(metaLine).FontSize(7.5f).SemiBold().FontColor("#6B7280");
        });
    }

    private static void ComposeSectionTitle(ColumnDescriptor col, string title, string primaryColor)
    {
        col.Item().PaddingTop(7).PaddingBottom(2).Row(row =>
        {
            row.ConstantItem(3).Height(11).Background(primaryColor);
            row.RelativeItem().PaddingLeft(5).Text(title).FontSize(8.5f).Bold().FontColor("#1E293B");
        });
    }

    private static void ComposeKpiCell(RowDescriptor row, string label, string value, string? subtext = null)
    {
        row.RelativeItem().Border(1).BorderColor("#E2E8F0").Background("#F8FAFC").Padding(4).Column(c =>
        {
            c.Item().Text(label).FontSize(6.5f).SemiBold().FontColor("#64748B");
            c.Item().PaddingTop(1).Text(value).FontSize(10.5f).Bold().FontColor("#0F172A");
            if (!string.IsNullOrWhiteSpace(subtext))
            {
                c.Item().Text(subtext).FontSize(6f).FontColor("#94A3B8");
            }
        });
    }

    private static void ComposeSignOffBlock(ColumnDescriptor col, string preparedBy, string preparedTitle, string verifiedTitle)
    {
        col.Item().PaddingTop(14).Row(row =>
        {
            row.RelativeItem().Column(c =>
            {
                c.Item().Text("PREPARED BY:").FontSize(7f).SemiBold().FontColor("#64748B");
                c.Item().PaddingTop(18).LineHorizontal(0.5f).LineColor("#9CA3AF");
                c.Item().PaddingTop(2).Text(preparedBy).FontSize(8.5f).Bold().FontColor("#111827");
                c.Item().Text(preparedTitle).FontSize(7f).FontColor("#6B7280");
            });

            row.ConstantItem(30).Height(1);

            row.RelativeItem().Column(c =>
            {
                c.Item().Text("NOTED / APPROVED BY:").FontSize(7f).SemiBold().FontColor("#64748B");
                c.Item().PaddingTop(18).LineHorizontal(0.5f).LineColor("#9CA3AF");
                c.Item().PaddingTop(2).Text("Authorized Signatory").FontSize(8.5f).Bold().FontColor("#111827");
                c.Item().Text(verifiedTitle).FontSize(7f).FontColor("#6B7280");
            });
        });
    }

    private static void TableHeaderCell(IContainer cell, string text, bool alignRight = false)
    {
        var c = cell.Background("#F1F5F9").BorderBottom(1).BorderColor("#CBD5E1").PaddingVertical(3.5f).PaddingHorizontal(4);
        if (alignRight)
            c.AlignRight().Text(text).FontSize(7.5f).Bold().FontColor("#334155");
        else
            c.Text(text).FontSize(7.5f).Bold().FontColor("#334155");
    }

    private static void TableDataCell(IContainer cell, string text, bool alignRight = false, bool bold = false, string fontColor = "#1F2937")
    {
        var c = cell.BorderBottom(0.5f).BorderColor("#E2E8F0").PaddingVertical(3f).PaddingHorizontal(4);
        if (alignRight)
        {
            var t = c.AlignRight().Text(text).FontSize(7.5f).FontColor(fontColor);
            if (bold) t.Bold();
        }
        else
        {
            var t = c.Text(text).FontSize(7.5f).FontColor(fontColor);
            if (bold) t.Bold();
        }
    }

    // The default every clinic row was created with; a clinic still on it has not chosen its own accent.
    private const string LegacyDefaultAccent = "#0284C7";

    /// <summary>
    /// Accent precedence: the clinic's own choice, then the workspace brand accent, then the product default.
    /// Reads the cached workspace profile only (no network), so printing never waits on the portal.
    /// </summary>
    private string ResolveAccent(ClinicSettings settings)
    {
        var workspaceAccent = _workspaceProfiles?.TryGetCached(settings.TenantId.ToString())?.AccentColorHex;
        return WorkspaceBrand.ResolveAccent(settings.PrimaryColorHex, workspaceAccent, LegacyDefaultAccent);
    }

    private TenantPrintoutConfig MapToReportTenantConfig(ClinicSettings settings)
    {
        var config = MapToTenantConfig(settings);
        if (string.IsNullOrWhiteSpace(settings.LetterheadFooter))
        {
            config.CustomDisclaimerText = "Official Clinic EZ Electronic Report. Valid Philippine medical & financial document issued in compliance with RA 8792 & RA 10173.";
        }
        return config;
    }

    private TenantPrintoutConfig MapToTenantConfig(ClinicSettings settings)
    {
        return new TenantPrintoutConfig
        {
            FacilityName = settings.LetterheadHeader ?? settings.ClinicName,
            FacilitySubHeader = settings.LetterheadSubHeader ?? "Accredited Outpatient Medical Facility",
            PhysicalAddress = settings.LetterheadAddress ?? "Philippines",
            ContactNumbers = settings.LetterheadContact,
            TaxIdentificationNumber = settings.TaxIdentificationNumber,
            PhilHealthAccreditationNumber = settings.AccreditationNumber,
            PrimaryColorHex = ResolveAccent(settings),
            PaperSize = settings.PaperSize?.ToLowerInvariant() switch
            {
                "a4" => DocumentPaperSize.A4,
                "a5" => DocumentPaperSize.A5,
                _ => DocumentPaperSize.Letter
            },
            CustomDisclaimerText = settings.LetterheadFooter ?? "Valid Philippine Medical Certificate & Prescription. Digitally issued via Clinic EZ in compliance with RA 8792 & RA 10173."
        };
    }
}
