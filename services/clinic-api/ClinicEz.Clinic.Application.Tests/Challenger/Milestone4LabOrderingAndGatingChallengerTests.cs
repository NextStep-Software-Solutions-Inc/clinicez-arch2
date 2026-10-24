using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Adversarial Empirical Challenger Suite:
/// Milestone 4 In-House Lab Ordering Gates, Nurse-Orderable Catalog Enforcement,
/// External Routing Guardrails, and Physician PRC License Mandates.
/// </summary>
public class Milestone4LabOrderingAndGatingChallengerTests
{
    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_m4_challenger_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    private static CreateClinicLabOrderCommandHandler CreateHandler(
        ApplicationDbContext db,
        ISieveProcessor sieve,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Guid clinicId,
        string tenantId,
        IRepository<ClinicServiceItem>? serviceRepo = null)
    {
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        return new CreateClinicLabOrderCommandHandler(
            orderRepo,
            patientRepo,
            staffRepo,
            unitOfWork,
            clinicContext,
            Phase3TestKit.Identity(clinicId, tenantId),
            new LabRequisitionPublisher(new InteropPublisher(db)),
            Phase3TestKit.Grants(db),
            Phase3TestKit.Claims(null),
            Phase3TestKit.Documents(db),
            serviceRepo);
    }

    private static async Task<ClinicPatient> SeedPatientAsync(ApplicationDbContext db, Guid clinicId, string tenantId)
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..10],
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 5, 15),
            Gender = "Male",
            ContactNumber = "09171234567"
        };
        await db.Patients.AddAsync(patient);
        return patient;
    }

    #region Probe 1: In-House Rapid Test Ordered by Nurse (isRouted == false, IsNurseOrderable == true)

    [Fact]
    public async Task Challenge_01_InHouseRapidTest_NurseOrderable_OrderedByNurse_SucceedsWithoutDoctorOrPrc()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var rbsService = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar (RBS)",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(rbsService);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: null, // Nurse order: no doctor
            OrderedByDoctorName: null,
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar (RBS)", "Clinical Chemistry", "Capillary fingerstick")
            });

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Status.Should().Be(LabOrderStatus.Ordered);
        result.Stage.Should().Be(LabOrderStage.Issued);
        result.OrderedByDoctorId.Should().BeNull();
        result.Items.Should().ContainSingle(i => i.TestName == "Random Blood Sugar (RBS)");

        var persisted = await db.LabOrders.FirstOrDefaultAsync(o => o.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.TargetFacilityId.Should().BeNull();
        persisted.TargetTenantId.Should().BeNull();
    }

    [Fact]
    public async Task Challenge_02_InHouseTest_CatalogCodeMatch_CaseInsensitive_Succeeds()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var urineService = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-URINE-DIP",
            Name = "Urinalysis Dipstick",
            Category = "Clinical Microscopy",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(urineService);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        // Nurse specifies lowercase code as item name
        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("lab-urine-dip", "Clinical Microscopy", null)
            });

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Status.Should().Be(LabOrderStatus.Ordered);
    }

    #endregion

    #region Probe 2: In-House Test Ordered by Nurse (IsNurseOrderable == false or missing)

    [Fact]
    public async Task Challenge_03_InHouseTest_NonNurseOrderable_OrderedByNurse_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var biopsyService = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-BIOPSY",
            Name = "Core Needle Biopsy",
            Category = "Surgical Pathology",
            IsNurseOrderable = false, // Strictly physician-orderable
            IsActive = true
        };
        await db.ServiceItems.AddAsync(biopsyService);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Core Needle Biopsy", "Surgical Pathology", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only laboratory tests flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required for 'Core Needle Biopsy'.*");
    }

    [Fact]
    public async Task Challenge_04_InHouseTest_UncataloguedTest_OrderedByNurse_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        // Order test that does not exist in ServiceItems
        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Experimental Flow Cytometry", "Special Immunology", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only laboratory tests flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required for 'Experimental Flow Cytometry'.*");
    }

    [Fact]
    public async Task Challenge_05_InHouseTest_MultiItem_OneNurseOrderable_OneNot_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var orderableItem = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true,
            IsActive = true
        };
        var nonOrderableItem = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-LIPID",
            Name = "Lipid Panel",
            Category = "Clinical Chemistry",
            IsNurseOrderable = false,
            IsActive = true
        };
        await db.ServiceItems.AddRangeAsync(orderableItem, nonOrderableItem);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null),
                new("Lipid Panel", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert: Must reject and identify the non-orderable test
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only laboratory tests flagged as nurse-orderable*Lipid Panel*");
    }

    [Fact]
    public async Task Challenge_06_InHouseTest_DefaultItemsFallback_WhenCbcNotNurseOrderable_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var cbcService = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-CBC",
            Name = "Complete Blood Count (CBC) with Platelet",
            Category = "Hematology",
            IsNurseOrderable = false, // Not nurse orderable
            IsActive = true
        };
        await db.ServiceItems.AddAsync(cbcService);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        // Command with null Items defaults to CBC with Platelet
        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            Items: null);

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only laboratory tests flagged as nurse-orderable*Complete Blood Count (CBC) with Platelet*");
    }

    #endregion

    #region Probe 3: External Routed Test Without Doctor (isRouted == true, OrderedByDoctorId == null/empty)

    [Fact]
    public async Task Challenge_07_ExternalRouted_WithoutDoctor_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var rbsItem = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true, // Even if nurse-orderable in-house!
            IsActive = true
        };
        await db.ServiceItems.AddAsync(rbsItem);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: null, // No doctor
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("OrderedByDoctorId is required to route a lab order to a laboratory.");
    }

    [Fact]
    public async Task Challenge_08_ExternalRouted_WithGuidEmptyDoctor_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: Guid.Empty, // Empty GUID doctor
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("OrderedByDoctorId is required to route a lab order to a laboratory.");
    }

    #endregion

    #region Probe 4: External Routed Test With Doctor Missing PRC License

    [Fact]
    public async Task Challenge_09_ExternalRouted_DoctorMissingPrcLicense_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var doctorWithoutPrc = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Doctor",
            LastName = "NoLicense",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = null, // Null PRC license
            IsActive = true
        };
        await db.StaffMembers.AddAsync(doctorWithoutPrc);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: doctorWithoutPrc.Id,
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*The ordering doctor has no PRC license number on file; add it to the staff profile before routing a lab order.*");
    }

    [Fact]
    public async Task Challenge_10_ExternalRouted_DoctorWhitespacePrcLicense_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var doctorWhitespacePrc = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Doctor",
            LastName = "BlankLicense",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "   ", // Whitespace PRC license
            IsActive = true
        };
        await db.StaffMembers.AddAsync(doctorWhitespacePrc);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: doctorWhitespacePrc.Id,
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*The ordering doctor has no PRC license number on file; add it to the staff profile before routing a lab order.*");
    }

    [Fact]
    public async Task Challenge_11_ExternalRouted_DoctorFromAnotherClinic_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var foreignDoctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(), // Different clinic!
            TenantId = tenantId,
            FirstName = "Foreign",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-888888",
            IsActive = true
        };
        await db.StaffMembers.AddAsync(foreignDoctor);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: foreignDoctor.Id,
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar", "Clinical Chemistry", null)
            });

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage($"*Ordering doctor '{foreignDoctor.Id}' was not found in this clinic.*");
    }

    #endregion

    #region Probe 5: Doctor Ordering Prerogative & Routing Guardrails

    [Fact]
    public async Task Challenge_12_DoctorWithValidPrc_CanOrderInHouseNonNurseOrderableTest_Succeeds()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Carlos",
            LastName = "Mendoza",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0012345",
            IsActive = true
        };
        await db.StaffMembers.AddAsync(doctor);

        var biopsyService = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "LAB-BIOPSY",
            Name = "Core Needle Biopsy",
            Category = "Surgical Pathology",
            IsNurseOrderable = false, // Doctor-only
            IsActive = true
        };
        await db.ServiceItems.AddAsync(biopsyService);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            OrderedByDoctorId: doctor.Id,
            OrderedByDoctorName: "Dr. Carlos Mendoza",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Core Needle Biopsy", "Surgical Pathology", null)
            });

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.OrderedByDoctorId.Should().Be(doctor.Id);
        result.Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task Challenge_13_ExternalRouted_MissingTargetFacilityOrTenant_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId);

        // Case A: TargetFacilityId provided without TargetTenantId
        var commandA = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            TargetFacilityId: Guid.NewGuid().ToString(),
            TargetTenantId: null);

        var actA = async () => await handler.Handle(commandA, CancellationToken.None);
        await actA.Should().ThrowAsync<BadRequestException>()
            .WithMessage("TargetFacilityId and TargetTenantId must be provided together to route a lab order.");

        // Case B: TargetTenantId provided without TargetFacilityId
        var commandB = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            TargetFacilityId: null,
            TargetTenantId: "target-tenant-01");

        var actB = async () => await handler.Handle(commandB, CancellationToken.None);
        await actB.Should().ThrowAsync<BadRequestException>()
            .WithMessage("TargetFacilityId and TargetTenantId must be provided together to route a lab order.");
    }

    [Fact]
    public async Task Challenge_14_ExternalRouted_InvalidGuidTargetFacility_ThrowsBadRequestException()
    {
        // Arrange
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patient = await SeedPatientAsync(db, clinicId, tenantId);
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, sieve, uow, clinicContext, clinicId, tenantId);

        // Case A: Non-GUID string
        var commandA = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            TargetFacilityId: "invalid-guid-string",
            TargetTenantId: "target-tenant-01");

        var actA = async () => await handler.Handle(commandA, CancellationToken.None);
        await actA.Should().ThrowAsync<BadRequestException>()
            .WithMessage("TargetFacilityId must be a valid laboratory facility id.");

        // Case B: Guid.Empty string
        var commandB = new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Juan Dela Cruz",
            TargetFacilityId: Guid.Empty.ToString(),
            TargetTenantId: "target-tenant-01");

        var actB = async () => await handler.Handle(commandB, CancellationToken.None);
        await actB.Should().ThrowAsync<BadRequestException>()
            .WithMessage("TargetFacilityId must be a valid laboratory facility id.");
    }

    #endregion
}
