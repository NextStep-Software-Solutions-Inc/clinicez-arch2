using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.QualityControl.Commands;
using ClinicEz.Laboratory.Application.Features.QualityControl.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class QualityControlTests
{
    [Fact]
    public void WestgardRuleEvaluator_Should_Pass_Normal_Run()
    {
        // Target Mean: 100.0, SD: 5.0. Value: 102.0 (Z = +0.4)
        var result = WestgardRuleEvaluator.Evaluate(102.0, 100.0, 5.0);

        result.Status.Should().Be(QcRunStatus.Passed);
        result.ZScore.Should().Be(0.4);
        result.ViolatedRules.Should().BeEmpty();
    }

    [Fact]
    public void WestgardRuleEvaluator_Should_Trigger_1_2s_Warning()
    {
        // Value: 111.5 (Z = +2.3) -> Exceeds 2SD
        var result = WestgardRuleEvaluator.Evaluate(111.5, 100.0, 5.0);

        result.Status.Should().Be(QcRunStatus.Warning);
        result.ViolatedRules.Should().Contain("1_2s");
        result.RecommendedAction.Should().Contain("Warning: 1-2s rule violated");
    }

    [Fact]
    public void WestgardRuleEvaluator_Should_Reject_1_3s_Random_Error()
    {
        // Value: 117.0 (Z = +3.4) -> Exceeds 3SD
        var result = WestgardRuleEvaluator.Evaluate(117.0, 100.0, 5.0);

        result.Status.Should().Be(QcRunStatus.Rejected);
        result.ViolatedRules.Should().Contain("1_3s");
        result.RecommendedAction.Should().Contain("random error");
    }

    [Fact]
    public void WestgardRuleEvaluator_Should_Reject_2_2s_Systematic_Error()
    {
        // Previous run was Z = +2.2. Current run is 111.0 (Z = +2.2) -> 2 consecutive > +2SD
        var history = new List<double> { 2.2 };
        var result = WestgardRuleEvaluator.Evaluate(111.0, 100.0, 5.0, history);

        result.Status.Should().Be(QcRunStatus.Rejected);
        result.ViolatedRules.Should().Contain("2_2s");
        result.RecommendedAction.Should().Contain("systematic error");
    }

    [Fact]
    public void WestgardRuleEvaluator_Should_Reject_R_4s_Across_Controls()
    {
        // Current Level 1 is 111.0 (Z = +2.2). Peer Level 2 is Z = -2.1 -> Spread = 4.3SD (> 4SD)
        var result = WestgardRuleEvaluator.Evaluate(111.0, 100.0, 5.0, peerLevelZScore: -2.1);

        result.Status.Should().Be(QcRunStatus.Rejected);
        result.ViolatedRules.Should().Contain("R_4s");
        result.RecommendedAction.Should().Contain("R-4s violation");
    }

    [Fact]
    public void WestgardRuleEvaluator_Should_Reject_4_1s_Drift()
    {
        // 3 previous runs were all > +1SD: [1.2, 1.4, 1.1]. Current is 106.0 (Z = +1.2)
        var history = new List<double> { 1.2, 1.4, 1.1 };
        var result = WestgardRuleEvaluator.Evaluate(106.0, 100.0, 5.0, history);

        result.Status.Should().Be(QcRunStatus.Rejected);
        result.ViolatedRules.Should().Contain("4_1s");
        result.RecommendedAction.Should().Contain("4-1s systematic drift");
    }

    [Fact]
    public void QcLot_Should_Track_OpenVial_Stability_And_Expiry()
    {
        var now = DateTime.UtcNow;

        var lot = new QcLot
        {
            TenantId = "tenant-test",
            LotNumber = "LOT-2026-N",
            ControlName = "Bio-Rad Level 1",
            AnalyteCode = "FBS",
            ManufacturerExpirationDate = now.AddMonths(12),
            OpenVialDate = now.AddDays(-35), // opened 35 days ago
            OpenVialStabilityDays = 30 // stable for 30 days
        };

        lot.IsExpired(now).Should().BeTrue(); // Open-vial expired!

        var freshLot = new QcLot
        {
            TenantId = "tenant-test",
            LotNumber = "LOT-2026-FRESH",
            ControlName = "Bio-Rad Level 2",
            AnalyteCode = "FBS",
            ManufacturerExpirationDate = now.AddMonths(6),
            OpenVialDate = now.AddDays(-10),
            OpenVialStabilityDays = 30
        };

        freshLot.IsExpired(now).Should().BeFalse();
        freshLot.GetOpenVialExpirationDate().Should().Be(now.AddDays(-10).AddDays(30));
    }

    [Fact]
    public async Task RecordQcRunCommand_And_GetLeveyJenningsChartQuery_Should_Work_EndToEnd()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var lotRepo = LabTestDbHelper.CreateRepository<QcLot>(db, sieve);
        var runRepo = LabTestDbHelper.CreateRepository<QcRun>(db, sieve);

        // 1. Create Lot
        var lotHandler = new CreateQcLotCommandHandler(lotRepo, uow);
        var lotDto = await lotHandler.Handle(new CreateQcLotCommand(
            TenantId: "tenant-test",
            LotNumber: "LOT-GLUC-01",
            ControlName: "Liquichek Chemistry Level 2",
            Level: "Level2_Normal",
            AnalyteCode: "FBS",
            InstrumentName: "Cobas c311",
            TargetMean: 95.0,
            TargetStandardDeviation: 3.0,
            ManufacturerExpirationDate: DateTime.UtcNow.AddMonths(6)
        ), CancellationToken.None);

        lotDto.LotNumber.Should().Be("LOT-GLUC-01");

        // 2. Record 3 QC runs
        var runHandler = new RecordQcRunCommandHandler(lotRepo, runRepo, uow);

        // Run 1: 96.0 (Z = +0.33) -> Pass
        var r1 = await runHandler.Handle(new RecordQcRunCommand(lotDto.Id, 96.0, "Carlo RMT"), CancellationToken.None);
        r1.Status.Should().Be("Passed");

        // Run 2: 94.5 (Z = -0.17) -> Pass
        var r2 = await runHandler.Handle(new RecordQcRunCommand(lotDto.Id, 94.5, "Carlo RMT"), CancellationToken.None);
        r2.Status.Should().Be("Passed");

        // Run 3: 106.0 (Z = +3.67) -> Reject 1-3s
        var r3 = await runHandler.Handle(new RecordQcRunCommand(lotDto.Id, 106.0, "Carlo RMT"), CancellationToken.None);
        r3.Status.Should().Be("Rejected");
        r3.ViolationRules.Should().Contain("1_3s");

        // 3. Query Levey-Jennings Chart
        var chartHandler = new GetLeveyJenningsChartQueryHandler(lotRepo);
        var chart = await chartHandler.Handle(new GetLeveyJenningsChartQuery(LotId: lotDto.Id), CancellationToken.None);

        chart.Should().NotBeNull();
        chart!.TargetMean.Should().Be(95.0);
        chart.TargetSD.Should().Be(3.0);
        chart.Plus1SD.Should().Be(98.0);
        chart.Plus2SD.Should().Be(101.0);
        chart.Plus3SD.Should().Be(104.0);
        chart.Minus1SD.Should().Be(92.0);
        chart.Minus2SD.Should().Be(89.0);
        chart.Minus3SD.Should().Be(86.0);
        chart.Points.Should().HaveCount(3);
        chart.Points.Last().Status.Should().Be("Rejected");
    }
}
