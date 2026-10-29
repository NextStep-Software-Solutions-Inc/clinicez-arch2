using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Patients;

public class PatientAddressesAndGuardiansTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_patient_addr_guardian";
    private readonly IClinicContext _clinicContext;

    public PatientAddressesAndGuardiansTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task Register_Update_And_Query_PatientAddressesAndGuardians_ShouldPersistNormalized1NfEntities()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procedureRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, clinicContext: _clinicContext);
        var listHandler = new GetClinicPatientsQueryHandler(patientRepo);
        var getByIdHandler = new GetClinicPatientByIdQueryHandler(patientRepo);
        var chartHandler = new GetPatientChartQueryHandler(
            consultationRepo,
            triageRepo,
            procedureRepo,
            labRepo,
            invoiceRepo,
            _clinicContext,
            patientRepo: patientRepo);

        // 1. Register a minor patient with an official Home Address + Non-Relative Caregiver Guardian
        var registered = await registerHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Lucas",
            LastName: "Dela Cruz",
            MiddleName: "Santos",
            Suffix: null,
            DateOfBirth: new DateOnly(2016, 5, 14),
            Sex: "Male",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "O+",
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["secondary_address_line"] = "Dorm B, Room 204",
                ["secondary_city"] = "Quezon City"
            },
            Addresses: new List<PatientAddressDto>
            {
                new(
                    AddressType: "Permanent",
                    StreetAddress: "123 Corrales Ave",
                    BarangayPsgc: "1004305001",
                    BarangayName: "Barangay 1",
                    CityMunicipalityPsgc: "1004305000",
                    CityMunicipalityName: "Cagayan de Oro City",
                    ProvincePsgc: "1004300000",
                    ProvinceName: "Misamis Oriental",
                    RegionPsgc: "1000000000",
                    RegionName: "Region X (Northern Mindanao)",
                    ZipCode: "9000")
            },
            Guardians: new List<PatientGuardianDto>
            {
                new(
                    Id: null,
                    FirstName: "Elena",
                    LastName: "Reyes",
                    MiddleName: "Cruz",
                    Suffix: null,
                    BirthDate: new DateOnly(1985, 8, 20),
                    Sex: "Female",
                    ContactNumber: "09189998877",
                    RelationshipCode: "NON_RELATIVE_CAREGIVER",
                    RelationshipOtherSpecify: "Foster Aunt",
                    PhilHealthPin: "12-345678901-8",
                    IsPrimaryGuardian: true,
                    IsEmergencyContact: true)
            }), CancellationToken.None);

        registered.Addresses.Should().ContainSingle();
        registered.Addresses![0].AddressType.Should().Be("Permanent");
        registered.Addresses[0].CityMunicipalityName.Should().Be("Cagayan de Oro City");

        registered.Guardians.Should().ContainSingle();
        registered.Guardians![0].FirstName.Should().Be("Elena");
        registered.Guardians[0].RelationshipCode.Should().Be("NON_RELATIVE_CAREGIVER");
        registered.Guardians[0].RelationshipOtherSpecify.Should().Be("Foster Aunt");
        registered.Guardians[0].PhilHealthPin.Should().Be("123456789018"); // normalized to 12 digits

        // 2. Verify list, get-by-id, and chart queries hydrate official Addresses & Guardians
        var listed = await listHandler.Handle(new GetClinicPatientsQuery(), CancellationToken.None);
        listed.Should().ContainSingle(p => p.Id == registered.Id);
        listed[0].Addresses.Should().ContainSingle();
        listed[0].Guardians.Should().ContainSingle();

        var byId = await getByIdHandler.Handle(new GetClinicPatientByIdQuery(registered.Id), CancellationToken.None);
        byId.Should().NotBeNull();
        byId!.Addresses.Should().ContainSingle();
        byId.Guardians.Should().ContainSingle();

        var chart = await chartHandler.Handle(new GetPatientChartQuery(registered.Id), CancellationToken.None);
        chart.Addresses.Should().ContainSingle();
        chart.Guardians.Should().ContainSingle();
        chart.Demographics.Should().NotBeNull();
        chart.Demographics!.AddressLine.Should().Be("123 Corrales Ave");
        chart.Demographics.City.Should().Be("Cagayan de Oro City");
        chart.Demographics.Province.Should().Be("Misamis Oriental");
        chart.Demographics.EmergencyContactName.Should().Be("Elena Reyes");
        chart.Demographics.EmergencyContactPhone.Should().Be("09189998877");
        chart.Demographics.EmergencyContactRelationship.Should().Be("Foster Aunt");

        // 3. Update Home Address & Guardian in place
        var updated = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Lucas",
            LastName: "Dela Cruz",
            MiddleName: "Santos",
            Suffix: null,
            DateOfBirth: new DateOnly(2016, 5, 14),
            Sex: "Male",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: null,
            Addresses: new List<PatientAddressDto>
            {
                new(
                    AddressType: "Permanent",
                    StreetAddress: "456 Velez Street",
                    BarangayPsgc: "1004305002",
                    BarangayName: "Barangay 2",
                    CityMunicipalityPsgc: "1004305000",
                    CityMunicipalityName: "Cagayan de Oro City",
                    ProvincePsgc: "1004300000",
                    ProvinceName: "Misamis Oriental",
                    RegionPsgc: "1000000000",
                    RegionName: "Region X (Northern Mindanao)",
                    ZipCode: "9000")
            },
            Guardians: new List<PatientGuardianDto>
            {
                new(
                    Id: registered.Guardians[0].Id,
                    FirstName: "Maria",
                    LastName: "Dela Cruz",
                    MiddleName: null,
                    Suffix: null,
                    BirthDate: new DateOnly(1988, 2, 10),
                    Sex: "Female",
                    ContactNumber: "09170001122",
                    RelationshipCode: "MOTHER",
                    RelationshipOtherSpecify: null,
                    PhilHealthPin: "123456789018",
                    IsPrimaryGuardian: true,
                    IsEmergencyContact: true)
            }), CancellationToken.None);

        updated.Addresses.Should().ContainSingle();
        updated.Addresses![0].StreetAddress.Should().Be("456 Velez Street");
        updated.Guardians.Should().ContainSingle();
        updated.Guardians![0].FirstName.Should().Be("Maria");
        updated.Guardians[0].RelationshipCode.Should().Be("MOTHER");
        updated.Guardians[0].RelationshipOtherSpecify.Should().BeNull();

        // Physical active row count for Permanent address must remain 1 (updated in place)
        var activeAddresses = await context.Set<PatientAddress>().Where(a => a.PatientId == registered.Id && !a.IsDeleted).ToListAsync();
        activeAddresses.Should().ContainSingle();

        // 4. Clearing Guardians (empty list) soft-deletes existing guardian
        var cleared = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Lucas",
            LastName: "Dela Cruz",
            MiddleName: "Santos",
            Suffix: null,
            DateOfBirth: new DateOnly(2000, 5, 14), // adult
            Sex: "Male",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: null,
            Guardians: new List<PatientGuardianDto>()), CancellationToken.None);

        cleared.Guardians.Should().BeNullOrEmpty();
        var activeGuardians = await context.Set<PatientGuardian>().Where(g => g.PatientId == registered.Id && !g.IsDeleted).ToListAsync();
        activeGuardians.Should().BeEmpty();
    }
}
