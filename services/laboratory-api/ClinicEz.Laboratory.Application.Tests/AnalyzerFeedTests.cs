using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class AnalyzerFeedTests
{
    [Fact]
    public void AnalyzerFeedService_Should_Parse_ASTM_Frames()
    {
        var parser = new AnalyzerFeedService();
        var astm = "H|\\^&|||MINDRAY_BC5150||||||||1\r\n" +
                   "P|1|||PAT001||Santos^Maria\r\n" +
                   "O|1|ACC-2026-999||^^^CBC|R||||||A\r\n" +
                   "R|1|^^^HGB|14.2|g/dL|12.0-15.5|N||F\r\n" +
                   "R|2|^^^WBC|7.8|x10^3/uL|4.5-10.0|N||F\r\n" +
                   "R|3|^^^PLT|250|x10^3/uL|150-450|N||F\r\n" +
                   "L|1|N\r\n";

        var packet = parser.ParseFeed(astm);

        packet.Protocol.Should().Be("ASTM");
        packet.AnalyzerId.Should().Be("MINDRAY_BC5150");
        packet.AccessionNumber.Should().Be("ACC-2026-999");
        packet.Observations.Should().HaveCount(3);
        packet.Observations[0].AnalyteCode.Should().Be("HGB");
        packet.Observations[0].Value.Should().Be("14.2");
        packet.Observations[0].Unit.Should().Be("g/dL");
    }

    [Fact]
    public void AnalyzerFeedService_Should_Parse_HL7_ORU_R01()
    {
        var parser = new AnalyzerFeedService();
        var hl7 = "MSH|^~\\&|COBAS_C311|LAB|LIS|CLINIC|20260930160000||ORU^R01|MSG001|P|2.3.1\r\n" +
                  "PID|1||PAT001||Santos^Maria||19810515|F\r\n" +
                  "OBR|1||ACC-2026-998|CHEM^Clinical Chemistry\r\n" +
                  "OBX|1|NM|FBS^Fasting Blood Sugar||95.0|mg/dL|70.0-99.0|N|||F\r\n" +
                  "OBX|2|NM|CREA^Serum Creatinine||0.95|mg/dL|0.6-1.1|N|||F\r\n";

        var packet = parser.ParseFeed(hl7);

        packet.Protocol.Should().Be("HL7");
        packet.AnalyzerId.Should().Be("COBAS_C311");
        packet.AccessionNumber.Should().Be("ACC-2026-998");
        packet.Observations.Should().HaveCount(2);
        packet.Observations[0].AnalyteCode.Should().Be("FBS");
        packet.Observations[0].Value.Should().Be("95.0");
    }

    [Fact]
    public void AnalyzerFeedService_Should_Parse_JSON_Payload()
    {
        var parser = new AnalyzerFeedService();
        var json = """
        {
            "analyzerId": "SYSMEX_XN550",
            "accessionNumber": "ACC-2026-997",
            "observations": [
                { "code": "HGB", "name": "Hemoglobin", "value": "13.8", "unit": "g/dL" },
                { "code": "PLT", "name": "Platelets", "value": "220", "unit": "x10^3/uL" }
            ]
        }
        """;

        var packet = parser.ParseFeed(json);

        packet.Protocol.Should().Be("JSON");
        packet.AnalyzerId.Should().Be("SYSMEX_XN550");
        packet.AccessionNumber.Should().Be("ACC-2026-997");
        packet.Observations.Should().HaveCount(2);
    }

    [Fact]
    public async Task IngestAnalyzerFeedCommand_Should_Process_And_Update_Requisition()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);
        var feedService = new AnalyzerFeedService();

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-FEED-001",
            PatientName = "Grace Poe",
            PatientGender = "Female",
            Status = RequisitionStatus.PendingAccession,
            Specimens = new List<Specimen>
            {
                new() { Barcode = "ACC-FEED-001-S01", ContainerType = SpecimenContainerType.Purple_EDTA, Status = SpecimenStatus.Collected }
            }
        };

        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var simulatedAstm = feedService.GenerateSimulationPayload("Mindray BC-5150", "ACC-FEED-001", "ASTM");

        var handler = new IngestAnalyzerFeedCommandHandler(repo, uow, feedService);
        var result = await handler.Handle(new IngestAnalyzerFeedCommand(simulatedAstm), CancellationToken.None);

        result.AccessionNumber.Should().Be("ACC-FEED-001");
        result.IngestedCount.Should().BeGreaterThan(0);
        result.Requisition.Should().NotBeNull();
        result.Requisition!.Status.Should().Be(RequisitionStatus.InTesting.ToString());
        result.Requisition.AnalyteResults.Should().Contain(a => a.AnalyteCode == "HGB");
        result.Requisition.AnalyteResults.First(a => a.AnalyteCode == "HGB").Value.Should().Be("14.4");
    }
}
