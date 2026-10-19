using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class SpecimenManagementTests
{
    [Fact]
    public async Task RejectSpecimenCommand_Should_Set_Rejection_Reason_And_Cascade_Requisition_Status()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var specId1 = Guid.NewGuid();
        var specId2 = Guid.NewGuid();
        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-TEST-REJECT",
            PatientName = "Rodrigo Duterte",
            Status = RequisitionStatus.PendingAccession,
            Specimens = new List<Specimen>
            {
                new()
                {
                    Id = specId1,
                    Barcode = "ACC-TEST-REJECT-S01",
                    ContainerType = SpecimenContainerType.Purple_EDTA,
                    SpecimenType = "WholeBlood",
                    Status = SpecimenStatus.Pending
                },
                new()
                {
                    Id = specId2,
                    Barcode = "ACC-TEST-REJECT-S02",
                    ContainerType = SpecimenContainerType.Yellow_SST,
                    SpecimenType = "Serum",
                    Status = SpecimenStatus.Pending
                }
            }
        };

        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new RejectSpecimenCommandHandler(repo, uow);

        // Reject 1st specimen: Hemolyzed
        var result1 = await handler.Handle(new RejectSpecimenCommand(
            req.Id,
            specId1,
            ReasonCode: SpecimenRejectionReason.Hemolyzed,
            Notes: "Severe hemolysis grade 3+. Optical interference on CBC analyzer.",
            PhlebotomistName: "Jane MedTech",
            CorrectiveAction: "Recall patient for redraw."
        ), CancellationToken.None);

        result1.Specimens.First(s => s.Id == specId1).Status.Should().Be("Rejected");
        result1.Specimens.First(s => s.Id == specId1).RejectionReason.Should().Be("Hemolyzed");
        result1.Specimens.First(s => s.Id == specId1).CorrectiveAction.Should().Contain("Recall patient");
        // Requisition not yet fully rejected because spec 2 is still pending
        result1.Status.Should().Be(RequisitionStatus.PendingAccession.ToString());

        // Reject 2nd specimen: Clotted
        var result2 = await handler.Handle(new RejectSpecimenCommand(
            req.Id,
            specId2,
            ReasonCode: SpecimenRejectionReason.Clotted,
            Notes: "Microclot detected during aspiration.",
            PhlebotomistName: "Jane MedTech"
        ), CancellationToken.None);

        result2.Specimens.First(s => s.Id == specId2).Status.Should().Be("Rejected");
        // Now all specimens rejected -> Requisition status cascades to Rejected!
        result2.Status.Should().Be(RequisitionStatus.Rejected.ToString());
    }

    [Fact]
    public async Task StoreSpecimenCommand_Should_Set_Rack_Location_And_Temperature()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var specId = Guid.NewGuid();
        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-TEST-RACK",
            PatientName = "Benigno Aquino",
            Status = RequisitionStatus.InTesting,
            Specimens = new List<Specimen>
            {
                new()
                {
                    Id = specId,
                    Barcode = "ACC-TEST-RACK-S01",
                    ContainerType = SpecimenContainerType.Yellow_SST,
                    SpecimenType = "Serum",
                    Status = SpecimenStatus.Collected
                }
            }
        };

        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new StoreSpecimenCommandHandler(repo, uow);
        var result = await handler.Handle(new StoreSpecimenCommand(
            req.Id,
            specId,
            RackId: "RACK-CHEM-A",
            RackPosition: "B04",
            Temperature: StorageTemperature.Refrigerated_2_8C
        ), CancellationToken.None);

        var storedSpec = result.Specimens.First(s => s.Id == specId);
        storedSpec.RackId.Should().Be("RACK-CHEM-A");
        storedSpec.RackPosition.Should().Be("B04");
        storedSpec.StorageStatus.Should().Be("StoredInRack");
        storedSpec.StorageTemperature.Should().Be("Refrigerated_2_8C");
        storedSpec.StoredAt.Should().NotBeNull();
    }

    [Fact]
    public async Task GetPrintableStickersQuery_Should_Generate_Color_Coded_Stickers()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-PRINT-STICKER",
            PatientName = "Corazon Aquino",
            PatientGender = "Female",
            PatientAge = 65,
            PhilHealthPin = "01-998877665-1",
            Urgency = "STAT",
            Specimens = new List<Specimen>
            {
                new() { Barcode = "ACC-PRINT-01", ContainerType = SpecimenContainerType.Purple_EDTA, SpecimenType = "WholeBlood", Status = SpecimenStatus.Pending },
                new() { Barcode = "ACC-PRINT-02", ContainerType = SpecimenContainerType.Yellow_SST, SpecimenType = "Serum", Status = SpecimenStatus.Pending },
                new() { Barcode = "ACC-PRINT-03", ContainerType = SpecimenContainerType.LightBlue_Citrate, SpecimenType = "Plasma", Status = SpecimenStatus.Pending },
                new() { Barcode = "ACC-PRINT-04", ContainerType = SpecimenContainerType.Urine_Cup, SpecimenType = "Urine", Status = SpecimenStatus.Pending }
            }
        };

        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new GetPrintableStickersQueryHandler(repo);
        var stickers = await handler.Handle(new GetPrintableStickersQuery(RequisitionId: req.Id), CancellationToken.None);

        stickers.Should().HaveCount(4);
        
        var edta = stickers.First(s => s.ContainerType == "Purple_EDTA");
        edta.ContainerColor.Should().Contain("Lavender");
        edta.HexColor.Should().Be("#7C3AED");
        edta.PatientName.Should().Be("Corazon Aquino");
        edta.Urgency.Should().Be("STAT");

        var sst = stickers.First(s => s.ContainerType == "Yellow_SST");
        sst.ContainerColor.Should().Contain("Gold");
        sst.HexColor.Should().Be("#D97706");

        var cit = stickers.First(s => s.ContainerType == "LightBlue_Citrate");
        cit.ContainerColor.Should().Contain("Light Blue");
        cit.HexColor.Should().Be("#0284C7");

        var uri = stickers.First(s => s.ContainerType == "Urine_Cup");
        uri.ContainerColor.Should().Contain("Teal");
        uri.HexColor.Should().Be("#0D9488");
    }

    [Fact]
    public async Task GetRackInventoryQuery_Should_Filter_And_Order_By_Rack()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var req1 = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-RACK-01",
            PatientName = "Patient A",
            Specimens = new List<Specimen>
            {
                new()
                {
                    Barcode = "ACC-RACK-01-S01",
                    RackId = "RACK-CHEM-A",
                    RackPosition = "A01",
                    StorageStatus = SpecimenStorageStatus.StoredInRack,
                    StoredAt = DateTime.UtcNow
                },
                new()
                {
                    Barcode = "ACC-RACK-01-S02",
                    RackId = "RACK-HEMA-B",
                    RackPosition = "C05",
                    StorageStatus = SpecimenStorageStatus.StoredInRack,
                    StoredAt = DateTime.UtcNow
                }
            }
        };

        await db.LabRequisitions.AddAsync(req1);
        await db.SaveChangesAsync();

        var handler = new GetRackInventoryQueryHandler(repo);

        // Query all racks
        var all = await handler.Handle(new GetRackInventoryQuery(), CancellationToken.None);
        all.Should().HaveCount(2);

        // Query specific rack
        var chemOnly = await handler.Handle(new GetRackInventoryQuery("RACK-CHEM-A"), CancellationToken.None);
        chemOnly.Should().HaveCount(1);
        chemOnly[0].Barcode.Should().Be("ACC-RACK-01-S01");
        chemOnly[0].RackPosition.Should().Be("A01");
    }
}
