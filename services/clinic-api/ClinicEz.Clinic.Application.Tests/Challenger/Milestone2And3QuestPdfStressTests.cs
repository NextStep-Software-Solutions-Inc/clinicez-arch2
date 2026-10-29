using System;
using System.Collections.Generic;
using System.Text;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

public class Milestone2And3QuestPdfStressTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IDocumentSecurityService _securityService = new DocumentSecurityService();
    private readonly IQrCodeService _qrCodeService = new QrCodeService();

    private static FacilitySettings CreateStandardSettings() => new()
    {
        TenantId = "tenant-stress-01",
        ClinicId = Guid.NewGuid(),
        ClinicName = "St. Jude Outpatient Medical Center",
        LetterheadHeader = "ST. JUDE OUTPATIENT MEDICAL CENTER",
        LetterheadSubHeader = "Accredited Ambulatory Facility & Konsulta Provider",
        LetterheadAddress = "124 Rizal Ave, San Pedro, Laguna, Philippines",
        LetterheadContact = "Tel: (02) 8876-5432 • info@stjude.test",
        LetterheadFooter = "Official Clinic EZ Electronic Report. Valid Philippine medical & financial document.",
        TaxIdentificationNumber = "987-654-321-000",
        AccreditationNumber = "PHIC-KONSULTA-09214",
        PrimaryColorHex = "#0D6963",
        PaperSize = "Letter"
    };

    // =========================================================================
    // 1. Extreme Boundary: Zero Items & Empty Datasets Across All 5 Reports
    // =========================================================================
    [Fact]
    public void QuestPdf_Should_Generate_Valid_Pdfs_When_All_Collections_Are_Empty()
    {
        var settings = CreateStandardSettings();
        var date = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

        // 1. Daily EOD (Zero Items)
        var eod = new DailyEodReportDto(
            date, settings.TenantId, settings.ClinicId,
            0, 0, 0, 0, 0,
            0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new List<PaymentModeSummary>(),
            new List<DoctorWorkloadSummary>(),
            0, 0, 0, 0
        );
        var eodBytes = _pdfService.GenerateDailyEodReportPdf(eod, settings);
        ValidatePdfStream(eodBytes);

        // 2. Morbidity (Zero Items)
        var morb = new MorbidityReportDto(
            date.AddDays(-7), date, settings.TenantId, settings.ClinicId,
            settings.ClinicName, 0, 0,
            new List<MorbidityDiseaseRowDto>()
        );
        var morbBytes = _pdfService.GenerateMorbidityReportPdf(morb, settings);
        ValidatePdfStream(morbBytes);

        // 3. Tax Discounts (Zero Items)
        var tax = new TaxDiscountAuditReportDto(
            date.AddDays(-30), date, settings.TenantId, settings.ClinicId,
            0, 0m, 0m, 0m, 0m, 0m,
            new List<TaxDiscountAuditRowDto>()
        );
        var taxBytes = _pdfService.GenerateTaxDiscountAuditReportPdf(tax, settings);
        ValidatePdfStream(taxBytes);

        // 4. Doctor Shares (Zero Items)
        var shares = new DoctorSharesReportDto(
            date.AddDays(-15), date, settings.TenantId, settings.ClinicId,
            0, 0m, 0m, 0m,
            new List<DoctorWorkloadDetailDto>()
        );
        var sharesBytes = _pdfService.GenerateDoctorSharesReportPdf(shares, settings);
        ValidatePdfStream(sharesBytes);

        // 5. Clinic Analytics (Zero Items & Zero Flow)
        var analytics = new ClinicAnalyticsDto(
            date.AddDays(-30), date, settings.TenantId, settings.ClinicId,
            new FlowAnalyticsDto(0, 0, 0, 0, 0, 0.0, 0.0, 0, 0, 0),
            0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new List<DailyTrendPointDto>(),
            new List<TenderShareDto>(),
            new List<MorbidityItemDto>(),
            new List<ServiceUsageDto>(),
            new List<DoctorStatDto>()
        );
        var anlBytes = _pdfService.GenerateClinicAnalyticsPdf(analytics, settings);
        ValidatePdfStream(anlBytes);
    }

    // =========================================================================
    // 2. Extreme Boundary: Null or Whitespace PreparedByName Handling
    // =========================================================================
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void QuestPdf_Should_Safely_Handle_Null_Or_Whitespace_PreparedByName(string? preparedByName)
    {
        var settings = CreateStandardSettings();
        var date = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

        var eod = new DailyEodReportDto(
            date, settings.TenantId, settings.ClinicId,
            5, 3, 2, 5, 0,
            5000m, 500m, 250m, 250m, 0m, 4500m, 4500m, 4500m, 0m,
            new List<PaymentModeSummary> { new("Cash", 4500m, 5) },
            new List<DoctorWorkloadSummary> { new("Dr. Ramos", 5) },
            1, 2, 3, 0
        );

        var morb = new MorbidityReportDto(
            date.AddDays(-7), date, settings.TenantId, settings.ClinicId,
            settings.ClinicName, 10, 10, new List<MorbidityDiseaseRowDto>()
        );

        var tax = new TaxDiscountAuditReportDto(
            date.AddDays(-7), date, settings.TenantId, settings.ClinicId,
            1, 1000m, 100m, 100m, 100m, 900m, new List<TaxDiscountAuditRowDto>()
        );

        var shares = new DoctorSharesReportDto(
            date.AddDays(-7), date, settings.TenantId, settings.ClinicId,
            1, 1000m, 700m, 300m, new List<DoctorWorkloadDetailDto>()
        );

        var analytics = new ClinicAnalyticsDto(
            date.AddDays(-7), date, settings.TenantId, settings.ClinicId,
            new FlowAnalyticsDto(1, 0, 0, 0, 1, 5.0, 10.0, 1, 0, 0),
            1000m, 900m, 900m, 0m, 900m, 50m, 50m,
            new List<DailyTrendPointDto>(), new List<TenderShareDto>(),
            new List<MorbidityItemDto>(), new List<ServiceUsageDto>(), new List<DoctorStatDto>()
        );

        ValidatePdfStream(_pdfService.GenerateDailyEodReportPdf(eod, settings, preparedByName));
        ValidatePdfStream(_pdfService.GenerateMorbidityReportPdf(morb, settings, preparedByName));
        ValidatePdfStream(_pdfService.GenerateTaxDiscountAuditReportPdf(tax, settings, preparedByName));
        ValidatePdfStream(_pdfService.GenerateDoctorSharesReportPdf(shares, settings, preparedByName));
        ValidatePdfStream(_pdfService.GenerateClinicAnalyticsPdf(analytics, settings, preparedByName));
    }

    // =========================================================================
    // 3. Extreme Boundary: Unconfigured or Sparse FacilitySettings Across All Reports
    // =========================================================================
    [Fact]
    public void QuestPdf_Should_Handle_Unconfigured_Sparse_FacilitySettings_Without_Exceptions()
    {
        var unconfiguredSettings = new FacilitySettings
        {
            TenantId = "sparse-tenant",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Barebones Clinic",
            LetterheadHeader = null,
            LetterheadSubHeader = null,
            LetterheadAddress = null,
            LetterheadContact = null,
            LetterheadFooter = null,
            TaxIdentificationNumber = null,
            AccreditationNumber = null,
            PrimaryColorHex = "", // empty hex -> defaults safely
            PaperSize = ""        // empty paper size -> defaults to Letter
        };

        var date = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);
        var eod = new DailyEodReportDto(
            date, unconfiguredSettings.TenantId, unconfiguredSettings.ClinicId,
            1, 1, 0, 1, 0,
            1000m, 0m, 0m, 0m, 0m, 1000m, 1000m, 1000m, 0m,
            new List<PaymentModeSummary>(),
            new List<DoctorWorkloadSummary>(),
            0, 0, 0, 0
        );
        var morb = new MorbidityReportDto(
            date.AddDays(-7), date, unconfiguredSettings.TenantId, unconfiguredSettings.ClinicId,
            unconfiguredSettings.ClinicName, 0, 0, new List<MorbidityDiseaseRowDto>()
        );
        var tax = new TaxDiscountAuditReportDto(
            date.AddDays(-7), date, unconfiguredSettings.TenantId, unconfiguredSettings.ClinicId,
            0, 0m, 0m, 0m, 0m, 0m, new List<TaxDiscountAuditRowDto>()
        );
        var shares = new DoctorSharesReportDto(
            date.AddDays(-7), date, unconfiguredSettings.TenantId, unconfiguredSettings.ClinicId,
            0, 0m, 0m, 0m, new List<DoctorWorkloadDetailDto>()
        );
        var analytics = new ClinicAnalyticsDto(
            date.AddDays(-7), date, unconfiguredSettings.TenantId, unconfiguredSettings.ClinicId,
            new FlowAnalyticsDto(0, 0, 0, 0, 0, 0.0, 0.0, 0, 0, 0),
            0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new List<DailyTrendPointDto>(), new List<TenderShareDto>(),
            new List<MorbidityItemDto>(), new List<ServiceUsageDto>(), new List<DoctorStatDto>()
        );

        ValidatePdfStream(_pdfService.GenerateDailyEodReportPdf(eod, unconfiguredSettings));
        ValidatePdfStream(_pdfService.GenerateMorbidityReportPdf(morb, unconfiguredSettings));
        ValidatePdfStream(_pdfService.GenerateTaxDiscountAuditReportPdf(tax, unconfiguredSettings));
        ValidatePdfStream(_pdfService.GenerateDoctorSharesReportPdf(shares, unconfiguredSettings));
        ValidatePdfStream(_pdfService.GenerateClinicAnalyticsPdf(analytics, unconfiguredSettings));
    }

    // =========================================================================
    // 4. Special Characters & Unicode in Clinic Name, Doctor, and Diagnosis
    // =========================================================================
    [Fact]
    public void QuestPdf_Should_Render_Special_Characters_And_Xml_Entities_Cleanly()
    {
        var specialSettings = new FacilitySettings
        {
            TenantId = "tenant-special",
            ClinicId = Guid.NewGuid(),
            ClinicName = "<St. Jude & Children's Health Center> \"Specialist\" / 'Diagnostic' Clinic & Lab",
            LetterheadHeader = "<ST. JUDE & CHILDREN'S CLINIC>",
            LetterheadSubHeader = "Accredited & Certified — Niño & Peña Medical Group (100% Valid)",
            LetterheadAddress = "Unit 12-B, O'Connor Bldg., España Blvd., Manila, Philippines",
            LetterheadContact = "Tel: (02) 8876-5432 & +63 917 123 4567 • Email: support@stjude.test",
            LetterheadFooter = "Official Document w/ Legal Stamp & Verification (RA 8792 & RA 10173).",
            TaxIdentificationNumber = "999-888-777-000",
            AccreditationNumber = "PHIC-SPECIAL & KONSULTA",
            PrimaryColorHex = "#0D6963",
            PaperSize = "A4"
        };

        var date = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);
        var morbidity = new MorbidityReportDto(
            date.AddDays(-7), date, specialSettings.TenantId, specialSettings.ClinicId,
            specialSettings.ClinicName, 120, 150,
            new List<MorbidityDiseaseRowDto>
            {
                new(
                    Rank: 1,
                    Icd10Code: "J20.9",
                    Description: "Acute Bronchitis w/ Bronchospasm & Wheezing — Niño's Case <Severe> & \"Urgent\" [High-Risk]",
                    PediatricCases: 40,
                    AdultCases: 50,
                    SeniorCases: 20,
                    MaleCases: 55,
                    FemaleCases: 55,
                    TotalCases: 110,
                    PercentageOfTotal: 73.3
                ),
                new(
                    Rank: 2,
                    Icd10Code: "I10",
                    Description: "Essential (Primary) Hypertension w/ Cardiomegaly — Doctor's Note: O'Brien & Assoc. Protocol",
                    PediatricCases: 0,
                    AdultCases: 15,
                    SeniorCases: 25,
                    MaleCases: 20,
                    FemaleCases: 20,
                    TotalCases: 40,
                    PercentageOfTotal: 26.7
                )
            }
        );

        var tax = new TaxDiscountAuditReportDto(
            date.AddDays(-7), date, specialSettings.TenantId, specialSettings.ClinicId,
            1, 5000m, 1000m, 500m, 400m, 4000m,
            new List<TaxDiscountAuditRowDto>
            {
                new(
                    InvoiceNumber: "INV-20261020-001",
                    InvoiceDate: date,
                    PatientName: "Señora Maria Corazón <VIP> & Niño",
                    DiscountType: "SeniorCitizen (RA 9994)",
                    IdentificationCardNumber: "OSCA-MNL#99214/B",
                    GrossAmount: 5000m,
                    DiscountAmount: 1000m,
                    VatExemptSales: 4000m,
                    VatAmountExempted: 480m,
                    NetAmount: 4000m,
                    AmountPaid: 4000m,
                    OfficialReceiptNumber: "OR-20261020-001",
                    PaymentMethod: "Cash & GCash"
                )
            }
        );

        ValidatePdfStream(_pdfService.GenerateMorbidityReportPdf(morbidity, specialSettings, "Dr. José Rizal-Gómez, MD & Assoc."));
        ValidatePdfStream(_pdfService.GenerateTaxDiscountAuditReportPdf(tax, specialSettings, "Comptroller & Auditor <Internal>"));
    }

    // =========================================================================
    // 5. Large Financial Amounts (₱10,000,000+) & Formatting Scaling
    // =========================================================================
    [Fact]
    public void QuestPdf_Should_Format_Large_Financial_Amounts_Above_Ten_Million_Without_Layout_Crash()
    {
        var settings = CreateStandardSettings();
        var date = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

        // Multi-million financial figures
        var eod = new DailyEodReportDto(
            date, settings.TenantId, settings.ClinicId,
            15000, 9500, 5500, 14800, 200,
            125_750_000.75m,
            25_500_000.50m,
            15_250_000.00m,
            10_250_000.50m,
            20_000_000.00m,
            80_250_000.25m,
            75_000_000.00m,
            35_000_000.00m,
            5_250_000.25m,
            new List<PaymentModeSummary>
            {
                new("Cash", 35_000_000.00m, 8500),
                new("GCash", 25_000_000.00m, 4000),
                new("Bank Wire / Direct Credit", 15_000_000.00m, 2300)
            },
            new List<DoctorWorkloadSummary>
            {
                new("Dr. Allan Ramos, MD", 7500),
                new("Dr. Maria Clara De Los Santos, MD", 7300)
            },
            1200, 3500, 8000, 25
        );

        var eodBytes = _pdfService.GenerateDailyEodReportPdf(eod, settings, "Chief Comptroller");
        ValidatePdfStream(eodBytes);

        // Doctor Shares Multi-Million Test
        var shares = new DoctorSharesReportDto(
            date.AddDays(-30), date, settings.TenantId, settings.ClinicId,
            35000,
            185_000_000.00m,
            129_500_000.00m,
            55_500_000.00m,
            new List<DoctorWorkloadDetailDto>
            {
                new(
                    DoctorId: "doc-01",
                    DoctorName: "Dr. Roberto Gomez, MD, FPCP",
                    TotalEncounters: 20000,
                    TotalProceduresAssisted: 4500,
                    TotalConsultationGross: 60_000_000.00m,
                    TotalProcedureGross: 45_000_000.00m,
                    TotalGrossGenerated: 105_000_000.00m,
                    EstimatedPhysicianShare: 73_500_000.00m,
                    ClinicFacilityShare: 31_500_000.00m
                ),
                new(
                    DoctorId: "doc-02",
                    DoctorName: "Dr. Maria Kristine Cruz, MD",
                    TotalEncounters: 15000,
                    TotalProceduresAssisted: 3000,
                    TotalConsultationGross: 45_000_000.00m,
                    TotalProcedureGross: 35_000_000.00m,
                    TotalGrossGenerated: 80_000_000.00m,
                    EstimatedPhysicianShare: 56_000_000.00m,
                    ClinicFacilityShare: 24_000_000.00m
                )
            }
        );

        var sharesBytes = _pdfService.GenerateDoctorSharesReportPdf(shares, settings, "Hospital Finance");
        ValidatePdfStream(sharesBytes);
    }

    [Fact]
    public void QuestPdf_Should_Generate_Valid_Invoice_And_Soa_Pdfs()
    {
        var settings = CreateStandardSettings();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            PatientCode = "PAT-001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1955, 3, 15),
            Gender = Gender.Female,
            SeniorCitizenId = "OSCA-987654",
            PwdId = "PWD-123456"
        };
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FirstName = "Jose",
            LastName = "Rizal",
            Title = "Dr.",
            PrcLicenseNumber = "0123456"
        };

        var draftInvoice = new Invoice
        {
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            InvoiceNumber = "SOA-20261020-001",
            InvoiceDate = DateTime.UtcNow,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            AttendingDoctorId = doctor.Id,
            DiscountType = Domain.Enums.DiscountType.SeniorCitizen,
            DiscountIdNumber = "OSCA-987654",
            DiscountPercentage = 20m,
            GrossAmount = 1500m,
            DiscountAmount = 300m,
            NetAmount = 1200m,
            BalanceDue = 1200m,
            Status = Domain.Enums.InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = doctor.Id,
                    DoctorName = $"Dr. {doctor.FirstName} {doctor.LastName}",
                    Description = "General Consultation",
                    Category = "Consultation",
                    UnitPrice = 500m,
                    Quantity = 1,
                    TotalPrice = 500m
                },
                new()
                {
                    DoctorId = doctor.Id,
                    DoctorName = $"Dr. {doctor.FirstName} {doctor.LastName}",
                    Description = "Complete Blood Count (CBC)",
                    Category = "Laboratory",
                    UnitPrice = 1000m,
                    Quantity = 1,
                    TotalPrice = 1000m
                }
            }
        };

        var soaBytes = _pdfService.GenerateInvoicePdf(draftInvoice, settings, doctor, patient, "Q-001");
        ValidatePdfStream(soaBytes);

        var paidInvoice = new Invoice
        {
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            InvoiceNumber = "INV-20261020-001",
            InvoiceDate = DateTime.UtcNow,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            AttendingDoctorId = doctor.Id,
            GrossAmount = 1000m,
            NetAmount = 1000m,
            AmountPaid = 1000m,
            BalanceDue = 0m,
            Status = Domain.Enums.InvoiceStatus.Paid,
            BilledByStaffName = "Jane Cashier",
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    PaymentNumber = "OR-20261020-001",
                    Amount = 1000m,
                    Method = Domain.Enums.PaymentMethod.Cash,
                    PaymentDate = DateTime.UtcNow
                }
            },
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Description = "Follow-up Consultation",
                    Category = "Consultation",
                    UnitPrice = 1000m,
                    Quantity = 1,
                    TotalPrice = 1000m
                }
            }
        };

        var paidBytes = _pdfService.GenerateInvoicePdf(paidInvoice, settings, doctor, patient);
        ValidatePdfStream(paidBytes);

        var previewRequest = new Application.Features.Billing.DTOs.InvoicePreviewRequest(
            patient.Id,
            $"{patient.FirstName} {patient.LastName}",
            "Q-002",
            doctor.PrcLicenseNumber,
            Domain.Enums.DiscountType.Pwd,
            "PWD-123456",
            new List<Application.Features.Billing.DTOs.CreateInvoiceLineItemRequest>
            {
                new(Guid.NewGuid(), "SRV-01", "Wound Dressing", "Procedure", 750m, 1)
            },
            "Post-op dressing"
        );

        var previewBytes = _pdfService.GenerateInvoicePreviewPdf(previewRequest, settings, doctor, patient);
        ValidatePdfStream(previewBytes);
    }

    // =========================================================================
    // 6. Cryptographic Digest, QR Code Authenticity & Tamper Resistance
    // =========================================================================
    [Fact]
    public void DocumentSecurityService_And_QrCode_Should_Be_Authentically_Generated_And_Tamper_Resistant()
    {
        var tenantId = "tenant-sec-test";
        var docType = "DAILY-EOD";
        var docNumber = "EOD-20261020";
        var staffPrc = "SYSTEM-AUDIT";
        var issuedAt = new DateTime(2026, 10, 20, 3, 30, 0, DateTimeKind.Utc);

        // 1. Digest generation & canonical format
        var digest = _securityService.ComputeDocumentDigest(tenantId, docType, docNumber, null, staffPrc, issuedAt);
        digest.Should().StartWith("SEC-SHA256-");
        digest.Length.Should().Be(27); // "SEC-SHA256-" (11) + 16 hex chars = 27

        // 2. Exact verification should pass
        var isValid = _securityService.VerifyDigest(tenantId, docType, docNumber, null, staffPrc, issuedAt, digest);
        isValid.Should().BeTrue("Canonical digest must verify successfully with authentic parameters");

        // 3. Tamper tests
        _securityService.VerifyDigest("tampered-tenant", docType, docNumber, null, staffPrc, issuedAt, digest)
            .Should().BeFalse("Changing tenantId must invalidate digest");
        _securityService.VerifyDigest(tenantId, "OTHER-DOC", docNumber, null, staffPrc, issuedAt, digest)
            .Should().BeFalse("Changing docType must invalidate digest");
        _securityService.VerifyDigest(tenantId, docType, "EOD-TAMPERED", null, staffPrc, issuedAt, digest)
            .Should().BeFalse("Changing docNumber must invalidate digest");
        _securityService.VerifyDigest(tenantId, docType, docNumber, null, "DR-TAMPERED", issuedAt, digest)
            .Should().BeFalse("Changing staffPrc must invalidate digest");
        _securityService.VerifyDigest(tenantId, docType, docNumber, null, staffPrc, issuedAt.AddMinutes(1), digest)
            .Should().BeFalse("Changing issuedAt timestamp must invalidate digest");

        // 4. Verification URL generation
        var verifyUrl = _securityService.GenerateVerificationUrl("https://verify.clinicez.test", "daily-eod", docNumber, digest);
        verifyUrl.Should().StartWith("https://verify.clinicez.test/verify/daily-eod/EOD-20261020?sig=");

        // 5. QR Code PNG matrix generation & PNG header validation
        var qrBytes = _qrCodeService.GenerateQrCodePng(verifyUrl, 4);
        qrBytes.Should().NotBeNull();
        qrBytes.Length.Should().BeGreaterThan(64);

        // Standard PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
        qrBytes[0].Should().Be(0x89);
        qrBytes[1].Should().Be(0x50); // P
        qrBytes[2].Should().Be(0x4E); // N
        qrBytes[3].Should().Be(0x47); // G
        qrBytes[4].Should().Be(0x0D);
        qrBytes[5].Should().Be(0x0A);
        qrBytes[6].Should().Be(0x1A);
        qrBytes[7].Should().Be(0x0A);
    }

    // =========================================================================
    // Helper: Validates PDF Stream Structure (%PDF- and %%EOF)
    // =========================================================================
    private static void ValidatePdfStream(byte[] pdfBytes)
    {
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);

        var pdfAscii = Encoding.ASCII.GetString(pdfBytes);
        pdfAscii.Should().StartWith("%PDF-", "Generated document must adhere to standard vector PDF header");
        pdfAscii.Should().Contain("%%EOF", "Generated document must terminate with valid vector PDF end-of-file trailer");
    }
}
