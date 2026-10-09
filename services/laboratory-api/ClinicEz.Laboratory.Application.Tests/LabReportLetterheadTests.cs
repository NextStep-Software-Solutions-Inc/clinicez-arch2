using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>A report prints what the laboratory has on record and nothing else: no placeholder identity, licenses or signatories.</summary>
public class LabReportLetterheadTests
{
    private static readonly string[] PlaceholderText =
    {
        "PRC-0045678", "PRC-0089123", "DOH-LTO-2026-004412-CL", "PHIC-LAB-992140",
        "Carlos Mendoza", "Roberto Gomez", "(02) 8523-9000", "Manila, Philippines",
        "124 Medical Plaza", "lab@example.com", "Routine Medical Checkup", "N/A",
        "ClinicEz Diagnostic Laboratory", "Clinical Chemistry • Hematology • Immunology"
    };

    private static LabRequisition Requisition(DiagnosticReport? report = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-test",
        LaboratoryId = Guid.NewGuid(),
        AccessionNumber = "ACC-LETTERHEAD-001",
        PatientName = "Test Patient",
        PatientAge = 40,
        PatientGender = "Female",
        OrderingFacilityName = "Test Clinic",
        OrderingDoctorName = "Dr. Test",
        Urgency = "Routine",
        Status = RequisitionStatus.InTesting,
        AnalyteResults = new List<AnalyteResult>
        {
            new()
            {
                PanelName = "Clinical Chemistry",
                AnalyteCode = "CREA",
                AnalyteName = "Serum Creatinine",
                Value = "0.95",
                Unit = "mg/dL",
                ReferenceInterval = "0.7 - 1.3",
                Flag = AnalyteFlag.Normal
            }
        },
        DiagnosticReport = report
    };

    private static void AssertNoPlaceholders(string html)
    {
        foreach (var text in PlaceholderText)
            html.Should().NotContain(text);
    }

    [Fact]
    public void An_unverified_preview_with_a_bare_letterhead_prints_no_invented_identity_signatories_or_impression()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var bare = new TenantPrintoutConfig { FacilityName = "Bare Lab" };
        var requisition = Requisition();

        var html = generator.GenerateHtml(requisition, bare);

        AssertNoPlaceholders(html);
        html.Should().Contain("Bare Lab");
        html.Should().Contain("PRELIMINARY");
        html.Should().NotContain("class='signatures-grid'");
        html.Should().NotContain("impression-box'>");
        html.Should().NotContain("DOH License to Operate");
        html.Should().NotContain("PhilHealth Laboratory Provider");
        html.Should().NotContain("PhilHealth PIN");
        html.Should().NotContain("Clinical Diagnosis");
        html.Should().NotContain("Report Released");

        generator.GeneratePdf(requisition, bare).Length.Should().BeGreaterThan(500);
    }

    [Fact]
    public void A_verified_report_prints_its_own_signatories_and_the_labs_own_letterhead()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var requisition = Requisition(new DiagnosticReport
        {
            ReportNumber = "RPT-1",
            PathologistName = "Dr. Real Pathologist",
            PathologistPrcLicense = "PRC-REAL-1",
            MedicalTechnologistName = "Real Medtech, RMT",
            MedicalTechnologistPrcLicense = "PRC-REAL-2",
            PathologistImpression = "Within normal limits."
        });
        requisition.ClinicalDiagnosis = "Annual checkup";
        requisition.PhilHealthPin = "12-345678901-2";
        var letterhead = new TenantPrintoutConfig
        {
            FacilityName = "Real Lab",
            PhysicalAddress = "1 Real Street",
            ContactNumbers = "555-0100",
            DohLicenseToOperate = "LTO-REAL",
            PhilHealthAccreditationNumber = "PH-REAL"
        };

        var html = generator.GenerateHtml(requisition, letterhead);

        AssertNoPlaceholders(html);
        html.Should().NotContain("PRELIMINARY");
        html.Should().ContainAll("Real Lab", "1 Real Street", "555-0100", "LTO-REAL", "PH-REAL",
            "Dr. Real Pathologist", "PRC-REAL-1", "Real Medtech, RMT", "PRC-REAL-2", "Within normal limits.",
            "Annual checkup", "12-345678901-2", "Report Released");
    }

    [Fact]
    public void A_signatory_without_a_recorded_prc_prints_no_license_text()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var requisition = Requisition(new DiagnosticReport
        {
            ReportNumber = "RPT-2",
            PathologistName = "Dr. Blank",
            PathologistPrcLicense = " ",
            MedicalTechnologistName = "Blank Medtech",
            MedicalTechnologistPrcLicense = string.Empty
        });

        var html = generator.GenerateHtml(requisition, new TenantPrintoutConfig { FacilityName = "Lab" });

        html.Should().Contain("<div class='sig-prc'>Consultant Clinical Pathologist</div>");
        html.Should().Contain("<div class='sig-prc'>Registered Medical Technologist</div>");
        AssertNoPlaceholders(html);
    }

    [Fact]
    public async Task The_letterhead_provider_carries_only_what_the_laboratory_recorded()
    {
        var (db, _, sieve) = LabTestDbHelper.CreateTestContext();
        using (db)
        {
            var labId = Guid.NewGuid();
            db.LabSettings.Add(new LabSettings
            {
                TenantId = "tenant-test",
                LaboratoryId = labId,
                LaboratoryName = "Recorded Lab",
                LicenseToOperateNumber = "  LTO-9  ",
                PhysicalAddress = "   "
            });
            await db.SaveChangesAsync();
            var requisition = Requisition();
            requisition.LaboratoryId = labId;

            var config = await LabTestDbHelper.CreatePrintoutConfig(db, sieve).GetAsync(requisition, CancellationToken.None);

            config.FacilityName.Should().Be("Recorded Lab");
            config.DohLicenseToOperate.Should().Be("LTO-9");
            config.PhysicalAddress.Should().BeNull();
            config.ContactNumbers.Should().BeNull();
            config.EmailAndWeb.Should().BeNull();
            config.PhilHealthAccreditationNumber.Should().BeNull();
            config.FacilitySubHeader.Should().BeNull();
        }
    }

    [Theory]
    [InlineData("", "PRC-1", "Med Tech", "PRC-2")]
    [InlineData("Dr. Path", " ", "Med Tech", "PRC-2")]
    [InlineData("Dr. Path", "PRC-1", "", "PRC-2")]
    [InlineData("Dr. Path", "PRC-1", "Med Tech", "")]
    public async Task Releasing_a_report_requires_both_signatories_and_their_prc_numbers(
        string pathologist, string pathologistPrc, string medTech, string medTechPrc)
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        using (db)
        {
            var handler = new VerifyAndSignReportCommandHandler(
                LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve),
                uow,
                Substitute.For<ClinicEz.Laboratory.Application.Common.Interfaces.IDiagnosticReportPublisher>(),
                new DiagnosticReportPdfGenerator(),
                LabTestDbHelper.CreatePrintoutConfig(db, sieve),
                LabTestDbHelper.CreateLifecycle(db, sieve));

            var act = () => handler.Handle(
                new VerifyAndSignReportCommand(Guid.NewGuid(), pathologist, pathologistPrc, medTech, medTechPrc), CancellationToken.None);

            await act.Should().ThrowAsync<BadRequestException>();
        }
    }
}
