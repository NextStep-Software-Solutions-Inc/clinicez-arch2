using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class ExpandedClinicalEngineTests
{
    [Fact]
    public void ReferenceRangeEvaluator_Should_Evaluate_All_Five_Laboratory_Sections()
    {
        // 1. Hematology (RBC & Differential)
        var (rbcFlag, _) = ReferenceRangeEvaluator.Evaluate("RBC", "5.10", "Male");
        rbcFlag.Should().Be(AnalyteFlag.Normal);

        var (neutFlag, _) = ReferenceRangeEvaluator.Evaluate("NEUT", "85.0", "Male"); // Normal 50-70
        neutFlag.Should().Be(AnalyteFlag.High);

        // 2. Clinical Chemistry (Potassium & Sodium Panic)
        var (critPotassium, kAlert) = ReferenceRangeEvaluator.Evaluate("K", "6.8", "Female");
        critPotassium.Should().Be(AnalyteFlag.Critical);
        kAlert.Should().Contain("CRITICAL PANIC");

        var (critSodium, naAlert) = ReferenceRangeEvaluator.Evaluate("NA", "118.0", "Male"); // < 120
        critSodium.Should().Be(AnalyteFlag.Critical);
        naAlert.Should().Contain("CRITICAL PANIC");

        // 3. Urinalysis (Qualitative Normal vs Critical Protein)
        var (uriNormal, _) = ReferenceRangeEvaluator.Evaluate("URI_COLOR", "Straw", "Female");
        uriNormal.Should().Be(AnalyteFlag.Normal);

        var (uriCritProt, protAlert) = ReferenceRangeEvaluator.Evaluate("URI_PROT", "4+", "Female");
        uriCritProt.Should().Be(AnalyteFlag.Critical);
        protAlert.Should().Contain("CRITICAL PANIC");

        // 4. Serology (Dengue NS1 Reactive Panic)
        var (dengueNonReactive, _) = ReferenceRangeEvaluator.Evaluate("DENGUE_NS1", "Non-Reactive", "Male");
        dengueNonReactive.Should().Be(AnalyteFlag.Normal);

        var (dengueReactive, dengueAlert) = ReferenceRangeEvaluator.Evaluate("DENGUE_NS1", "Reactive", "Male");
        dengueReactive.Should().Be(AnalyteFlag.Critical);
        dengueAlert.Should().Contain("CRITICAL PANIC");

        // 5. Immunoassay (Troponin I Panic)
        var (tropNormal, _) = ReferenceRangeEvaluator.Evaluate("TROP_I", "0.01", "Male");
        tropNormal.Should().Be(AnalyteFlag.Normal);

        var (tropPanic, tropAlert) = ReferenceRangeEvaluator.Evaluate("TROP_I", "0.25", "Male");
        tropPanic.Should().Be(AnalyteFlag.Critical);
        tropAlert.Should().Contain("CRITICAL PANIC");
    }

    [Fact]
    public void ReferenceRangeEvaluator_Should_Apply_Pediatric_Ranges()
    {
        // In Adults: WBC of 12.0 is HIGH (adult normal: 4.5-10.0)
        var (adultWbc, adultAlert) = ReferenceRangeEvaluator.Evaluate("WBC", "12.0", "Male", patientAge: 35);
        adultWbc.Should().Be(AnalyteFlag.High);

        // In Pediatrics (Age 5): WBC of 12.0 is NORMAL (pediatric normal: 5.0 - 15.5)
        var (pedWbc, pedAlert) = ReferenceRangeEvaluator.Evaluate("WBC", "12.0", "Male", patientAge: 5);
        pedWbc.Should().Be(AnalyteFlag.Normal);
    }

    [Fact]
    public void DeltaCheckEvaluator_Should_Flag_Critical_Shifts()
    {
        var prevDate = DateTime.UtcNow.AddDays(-2);
        var currDate = DateTime.UtcNow;

        // Creatinine jump from 0.9 to 2.2 mg/dL (144% shift)
        var result = DeltaCheckEvaluator.Evaluate("CREA", "2.2", "0.9", prevDate, currDate);
        result.Should().NotBeNull();
        result!.IsAlert.Should().BeTrue();
        result.Severity.Should().Be("Critical");
        result.PercentShift.Should().BeApproximately(144.4, 0.5);
        result.AlertMessage.Should().Contain("DELTA CHECK ALERT");
        result.AlertMessage.Should().Contain("increased from 0.9 to 2.2");

        // Hemoglobin drop from 14.0 to 9.0 g/dL (35.7% drop)
        var hgbResult = DeltaCheckEvaluator.Evaluate("HGB", "9.0", "14.0", prevDate, currDate);
        hgbResult.Should().NotBeNull();
        hgbResult!.IsAlert.Should().BeTrue();
        hgbResult.AlertMessage.Should().Contain("dropped from 14.0 to 9.0");
    }

    [Fact]
    public void DeltaCheckEvaluator_Should_Ignore_Normal_Physiological_Variations_And_Expired_Windows()
    {
        // Normal minor shift in Creatinine (0.90 to 0.95 -> 5.5% shift, limit is 50%)
        var minor = DeltaCheckEvaluator.Evaluate("CREA", "0.95", "0.90", DateTime.UtcNow.AddDays(-1), DateTime.UtcNow);
        minor.Should().BeNull();

        // Significant shift but outside the 30-day window (60 days ago)
        var expired = DeltaCheckEvaluator.Evaluate("CREA", "2.5", "0.9", DateTime.UtcNow.AddDays(-60), DateTime.UtcNow);
        expired.Should().BeNull();
    }

    [Fact]
    public async Task RecordAnalyteResultCommand_Should_Trigger_Delta_Check_Against_Prior_Encounters()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var patientId = Guid.NewGuid();

        // 1. Prior historical encounter 3 days ago
        var priorReq = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            PatientId = patientId,
            PatientName = "Ferdinand Marcos",
            AccessionNumber = "ACC-PRIOR-001",
            Status = RequisitionStatus.Verified,
            CreatedAt = DateTime.UtcNow.AddDays(-3),
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "CREA",
                    AnalyteName = "Serum Creatinine",
                    Value = "0.9",
                    Unit = "mg/dL",
                    ReferenceInterval = "0.7 - 1.3",
                    EnteredAt = DateTime.UtcNow.AddDays(-3)
                }
            }
        };
        await db.LabRequisitions.AddAsync(priorReq);

        // 2. Current encounter today
        var currentReq = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            PatientId = patientId,
            PatientName = "Ferdinand Marcos",
            AccessionNumber = "ACC-CURRENT-002",
            Status = RequisitionStatus.SpecimenCollected,
            CreatedAt = DateTime.UtcNow
        };
        await db.LabRequisitions.AddAsync(currentReq);
        await db.SaveChangesAsync();

        var handler = new RecordAnalyteResultCommandHandler(repo, uow, LabTestDbHelper.CreateLifecycle(db, sieve));
        var result = await handler.Handle(new RecordAnalyteResultCommand(
            currentReq.Id,
            "Carlos RMT",
            new List<AnalyteResultInput>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "CREA",
                    Value = "2.4" // Spikes from 0.9 to 2.4 (166% shift)
                }
            }
        ), CancellationToken.None);

        var creaResult = result.AnalyteResults.First(a => a.AnalyteCode == "CREA");
        creaResult.Interpretation.Should().Contain("DELTA CHECK ALERT");
        creaResult.Interpretation.Should().Contain("increased from 0.9 to 2.4");
    }
}
