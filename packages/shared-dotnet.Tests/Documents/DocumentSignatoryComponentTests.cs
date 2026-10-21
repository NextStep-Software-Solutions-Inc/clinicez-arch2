using System;
using System.Text;
using ClinicEz.Shared.Documents;
using ClinicEz.Shared.Documents.Common;
using ClinicEz.Shared.Documents.Components;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Xunit;

namespace ClinicEz.Shared.Tests.Documents;

public class DocumentSignatoryComponentTests
{
    public DocumentSignatoryComponentTests()
    {
        QuestPdfInitializer.EnsureInitialized();
    }

    [Fact]
    public void DocumentSpacingConstants_Has_Expected_Values()
    {
        DocumentSpacingConstants.FooterTopPadding.Should().Be(8f);
        DocumentSpacingConstants.SignatoryBottomPadding.Should().Be(12f);
        DocumentSpacingConstants.SignatoryTopPadding.Should().Be(14f);
    }

    [Theory]
    [InlineData(SignatureMode.WetSignature)]
    [InlineData(SignatureMode.DigitalSealOnly)]
    [InlineData(SignatureMode.ESignatureSpecimen)]
    public void ClinicianSignatoryComponent_Compiles_And_Generates_Valid_Pdf(SignatureMode mode)
    {
        var model = new ClinicianSignatoryModel
        {
            DoctorName = "Dr. Roberto V. Santos, MD, FPCP",
            TitleOrSpecialty = "Internal Medicine - Adult Cardiology",
            PrcLicense = "0098451",
            PtrNumber = "8472910",
            S2License = "S2-2026-9912",
            Mode = mode,
            DigitalSealBadgeText = "Digitally Certified & Locked",
            SignatureBytes = mode == SignatureMode.ESignatureSpecimen
                ? Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC")
                : null
        };

        var config = new TenantPrintoutConfig
        {
            FacilityName = "Metro Health Clinic",
            PhysicalAddress = "123 Medical Boulevard, Makati City"
        };

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.Letter);
                page.Margin(14, Unit.Millimetre);
                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().Column(col =>
                {
                    col.Item().Text("Clinical Encounter Notes").Bold().FontSize(14);
                    col.Item().Text("Patient presented with mild hypertension and requested medical certificate.");

                    // Anchor signatory at bottom above footer
                    col.SignatoryClinician(model);
                });

                page.Footer().Component(new DocumentFooterComponent(config, null, "HASH-12345"));
            });
        });

        var pdfBytes = doc.GeneratePdf();

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        var header = Encoding.ASCII.GetString(pdfBytes, 0, 10);
        header.Should().StartWith("%PDF-");
    }

    [Fact]
    public void DualSignatoryComponent_Compiles_And_Generates_Valid_Pdf()
    {
        var model = new DualSignatoryModel
        {
            Left = new SignatoryParty
            {
                Label = "PREPARED BY:",
                Name = "Nurse Maria Clara, RN",
                Title = "Triage Staff Nurse",
                Credentials = "PRC Lic. No. 0048192"
            },
            Right = new SignatoryParty
            {
                Label = "NOTED / APPROVED BY:",
                Name = "Dr. Juan dela Cruz, MD",
                Title = "Medical Director / Clinic Head",
                Credentials = "PRC Lic. No. 0071234"
            },
            BottomComplianceNotice = "Official Statutory Report • ClinicEZ Cloud Audit"
        };

        var config = new TenantPrintoutConfig
        {
            FacilityName = "National Diagnostic Center"
        };

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(14, Unit.Millimetre);
                page.Header().Component(new TenantLetterheadComponent(config));

                page.Content().Column(col =>
                {
                    col.Item().Text("Daily Operational Summary").Bold().FontSize(12);

                    col.SignatoryDual(model);
                });

                page.Footer().Component(new DocumentFooterComponent(config, null, "HASH-DUAL-789"));
            });
        });

        var pdfBytes = doc.GeneratePdf();

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        var header = Encoding.ASCII.GetString(pdfBytes, 0, 10);
        header.Should().StartWith("%PDF-");
    }

    [Fact]
    public void SignatoryBlock_Custom_Container_Compiles_And_Anchors_To_Bottom()
    {
        var config = new TenantPrintoutConfig { FacilityName = "Care Clinic" };

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.Letter);
                page.Margin(14, Unit.Millimetre);

                page.Content().Column(col =>
                {
                    col.Item().Text("Custom Audit Report").Bold();

                    col.SignatoryBlock(sigContainer =>
                    {
                        sigContainer.Row(r =>
                        {
                            r.RelativeItem().Text("Authorized Auditor Signature: __________________");
                        });
                    });
                });

                page.Footer().Component(new DocumentFooterComponent(config, null, null));
            });
        });

        var pdfBytes = doc.GeneratePdf();
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
    }
}
