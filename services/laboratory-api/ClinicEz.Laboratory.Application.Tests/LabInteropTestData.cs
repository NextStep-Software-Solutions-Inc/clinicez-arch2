using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging.Abstractions;
using Sieve.Services;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>Shared fixtures for the laboratory interop tests: one laboratory and two ordering clinics.</summary>
internal static class LabInteropTestData
{
    public const string LabTenant = "tenant-lab";
    public static readonly Guid LabId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static Party Lab => Party.ForFacility(LabTenant, LabId.ToString(), FacilityType.Laboratory);

    public static Party ClinicA =>
        Party.ForFacility("tenant-a", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", FacilityType.Clinic);

    public static Party ClinicB =>
        Party.ForFacility("tenant-b", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", FacilityType.Clinic);

    public static async Task SeedLabAsync(ApplicationDbContext db)
    {
        db.LabSettings.Add(new LabSettings
        {
            Id = Guid.NewGuid(),
            TenantId = LabTenant,
            LaboratoryId = LabId,
            LaboratoryName = "Test Laboratory"
        });
        await db.SaveChangesAsync();
    }

    public static async Task<LabOrderIssuedHandler> CreateOrderHandlerAsync(
        ApplicationDbContext db, IUnitOfWork uow, ISieveProcessor sieve)
    {
        await SeedLabAsync(db);
        return new LabOrderIssuedHandler(
            LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve),
            LabTestDbHelper.CreateRepository<LabSettings>(db, sieve),
            uow,
            NullLogger<LabOrderIssuedHandler>.Instance);
    }

    public static LabRequisitionIssuedEvent Order(string accessionNumber, Guid? requisitionId = null) => new()
    {
        RequisitionId = requisitionId ?? Guid.NewGuid(),
        AccessionNumber = accessionNumber,
        OrderingFacilityName = "Metro Health Clinic",
        OrderingDoctor = new OrderingDoctorDto { DoctorName = "Dr. Alice Tan", PrcLicenseNumber = "PRC-0012345" },
        Patient = new RequisitionPatientDto { PatientId = Guid.NewGuid(), FullName = "Clara Gomez", Age = 28, Gender = "Female" },
        Items = new List<RequisitionItemDto> { new() { ItemName = "Fasting Blood Sugar", Category = "Clinical Chemistry" } }
    };

    /// <summary>The envelope a clinic sends: correlation id is the clinic's requisition id.</summary>
    public static InteropEnvelope OrderEnvelope(LabRequisitionIssuedEvent order, Party from, Party? to = null) =>
        InteropEnvelope.Create(InteropTypes.LabOrderIssued, from, to ?? Lab, order.RequisitionId, order);
}
