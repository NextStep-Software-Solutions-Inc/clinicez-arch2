using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class UpdateClinicPatientConcurrencyAndAllergiesTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_demographics_concurrency";
    private readonly IClinicContext _clinicContext;

    public UpdateClinicPatientConcurrencyAndAllergiesTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private (ApplicationDbContext Context, IUnitOfWork Uow, Sieve.Services.ISieveProcessor Sieve) CreateInterceptorBackedContext()
    {
        var currentUser = Substitute.For<ICurrentUserService>();
        currentUser.UserId.Returns("staff-test-user");
        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUser);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"ClinicEz_DemographicsConcurrency_{Guid.NewGuid():N}")
            .AddInterceptors(interceptor)
            .Options;

        var context = new ApplicationDbContext(options, config, _clinicContext);
        var sieve = Substitute.For<Sieve.Services.ISieveProcessor>();
        var productRepo = Substitute.For<IProductRepository>();
        var uow = new UnitOfWork(context, sieve, productRepo);
        return (context, uow, sieve);
    }

    [Fact]
    public async Task UpdatePatient_LegacyStringAllergies_WithoutAllergyRepo_TracksNewEntitiesAsAddedNotModified()
    {
        var (context, uow, sieve) = CreateInterceptorBackedContext();
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var registered = await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Clarisse",
            LastName: "Alvarado",
            MiddleName: "Q",
            Suffix: null,
            DateOfBirth: new DateOnly(1977, 6, 4),
            Sex: "Female",
            CivilStatus: "Married",
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
            BloodType: "A+",
            Allergies: "Penicillin",
            ChronicConditions: null,
            Alerts: "Fall Risk"), CancellationToken.None);

        context.ChangeTracker.Clear();

        var observedAllergyStates = new List<(string Allergen, EntityState State)>();
        context.SavingChanges += (_, _) =>
        {
            foreach (var entry in context.ChangeTracker.Entries<PatientAllergy>())
            {
                observedAllergyStates.Add((entry.Entity.Allergen, entry.State));
            }
        };

        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, clinicContext: _clinicContext);
        var updated = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Clarisse",
            LastName: "Alvarado",
            MiddleName: "Quizon",
            Suffix: null,
            DateOfBirth: new DateOnly(1977, 6, 4),
            Sex: "Female",
            CivilStatus: "Married",
            ContactNumber: "09171234567",
            Email: "clarisse@example.com",
            Allergies: "Shellfish, Ibuprofen",
            Alerts: "Fall Risk, Bleeding Precaution"), CancellationToken.None);

        observedAllergyStates.Should().Contain(x => x.Allergen == "Shellfish" && x.State == EntityState.Added);
        observedAllergyStates.Should().Contain(x => x.Allergen == "Ibuprofen" && x.State == EntityState.Added);
        observedAllergyStates.Should().NotContain(x => (x.Allergen == "Shellfish" || x.Allergen == "Ibuprofen") && x.State == EntityState.Modified);

        updated.Allergies.Should().Contain("Shellfish");
        updated.Allergies.Should().Contain("Ibuprofen");
        updated.Allergies.Should().NotContain("Penicillin");
        updated.Alerts.Should().Be("Fall Risk, Bleeding Precaution");
    }

    [Fact]
    public async Task UpdatePatient_StructuredAllergies_ReconcilesUpdatesInsertsAndSoftDeletes_WithoutCorruptingAllergenNames()
    {
        var (context, uow, sieve) = CreateInterceptorBackedContext();
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var regHandler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            allergyRepo: allergyRepo,
            medicalRepo: medicalRepo);

        var registered = await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Joel",
            LastName: "Barrientos",
            MiddleName: "Q",
            Suffix: null,
            DateOfBirth: new DateOnly(1984, 9, 15),
            Sex: "Male",
            CivilStatus: "Single",
            ContactNumber: "09181112233",
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
            Allergies: "Amoxicillin (Medication - STAT), Shrimp (Food)",
            ChronicConditions: null,
            Alerts: "Fall Risk",
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Amoxicillin", AllergenDrugCode: "AMX500", Severity: "Severe", ReactionManifestation: "Anaphylaxis", IsAnaphylactic: true),
                new(Category: "Food", Allergen: "Shrimp", Severity: "Moderate", ReactionManifestation: "Hives", IsAnaphylactic: false)
            },
            MedicalHistories: new List<MedicalHistoryEntryDto>
            {
                new("Hypertension", "011", "I10", null, null, false, "Maintenance amlodipine")
            }), CancellationToken.None);

        registered.StructuredAllergies.Should().NotBeNull();
        registered.StructuredAllergies.Should().HaveCount(2);
        var originalAmoxId = registered.StructuredAllergies!.First(a => a.Allergen == "Amoxicillin").Id;

        context.ChangeTracker.Clear();

        var newlyAddedButMarkedModified = new List<Type>();
        var existingIdsBeforeUpdate = (await context.PatientAllergies.IgnoreQueryFilters().Select(a => a.Id).ToListAsync())
            .Concat(await context.PatientMedicalHistories.IgnoreQueryFilters().Select(m => m.Id).ToListAsync())
            .Concat(await context.PatientAddresses.IgnoreQueryFilters().Select(a => a.Id).ToListAsync())
            .Concat(await context.PatientGuardians.IgnoreQueryFilters().Select(g => g.Id).ToListAsync())
            .Concat(await context.PatientAlerts.IgnoreQueryFilters().Select(a => a.Id).ToListAsync())
            .Append(registered.Id)
            .ToHashSet();

        context.SavingChanges += (_, _) =>
        {
            foreach (var entry in context.ChangeTracker.Entries<BaseEntity>())
            {
                if (!existingIdsBeforeUpdate.Contains(entry.Entity.Id) && entry.State == EntityState.Modified)
                {
                    newlyAddedButMarkedModified.Add(entry.Entity.GetType());
                }
            }
        };

        var updateHandler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            medicalRepo: medicalRepo,
            clinicContext: _clinicContext,
            allergyRepo: allergyRepo);

        // Mirrors exact payload shape sent by EditPatientModal.tsx (both summary string + structured array)
        var updated = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Joel",
            LastName: "Barrientos",
            MiddleName: "Quintero",
            Suffix: null,
            DateOfBirth: new DateOnly(1984, 9, 15),
            Sex: "Male",
            CivilStatus: "Married",
            ContactNumber: "09181112233",
            Email: "joel.b@example.com",
            Allergies: "Amoxicillin (Medication - STAT), Latex (Environmental)",
            ChronicConditions: "Hypertension, Others: Gout",
            Alerts: "",
            MedicalHistories: new List<MedicalHistoryEntryDto>
            {
                new("Hypertension", "011", "I10", null, null, false, "Controlled"),
                new("Others", "998", "M10.9", "Gout", null, false, "Diet controlled")
            },
            Addresses: new List<PatientAddressDto>
            {
                new(AddressType: "Permanent", StreetAddress: "88 Osmeña Blvd", CityMunicipalityName: "Cebu City", ProvinceName: "Cebu", RegionPsgc: "0700000000")
            },
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Amoxicillin", AllergenDrugCode: "AMX500", Severity: "LifeThreatening", ReactionManifestation: "Airway edema", IsAnaphylactic: true, Notes: "Carry EpiPen"),
                new(Category: "Environmental", Allergen: "Latex", Severity: "Severe", ReactionManifestation: "Contact anaphylaxis", IsAnaphylactic: false)
            }), CancellationToken.None);

        newlyAddedButMarkedModified.Should().BeEmpty("brand-new child entities must never be tracked as EntityState.Modified");

        updated.Allergies.Should().Be("Amoxicillin, Latex");
        updated.StructuredAllergies.Should().NotBeNull();
        updated.StructuredAllergies.Should().HaveCount(2);

        var updatedAmox = updated.StructuredAllergies!.Single(a => a.Allergen == "Amoxicillin");
        updatedAmox.Id.Should().Be(originalAmoxId, "existing structured allergy must be updated in place");
        updatedAmox.Category.Should().Be("Medication");
        updatedAmox.Severity.Should().Be("LifeThreatening");
        updatedAmox.IsAnaphylactic.Should().BeTrue();
        updatedAmox.AllergenDrugCode.Should().Be("AMX500");
        updatedAmox.Notes.Should().Be("Carry EpiPen");

        var addedLatex = updated.StructuredAllergies!.Single(a => a.Allergen == "Latex");
        addedLatex.Id.Should().NotBeEmpty();
        addedLatex.Category.Should().Be("Environmental");
        addedLatex.Severity.Should().Be("Severe");

        // Shrimp was removed and must be soft-deleted
        var allDbAllergies = await context.PatientAllergies.IgnoreQueryFilters()
            .Where(a => a.PatientId == registered.Id)
            .ToListAsync();
        allDbAllergies.Should().HaveCount(3);
        allDbAllergies.Single(a => a.Allergen == "Shrimp").IsDeleted.Should().BeTrue();

        // ChronicConditions summary must NOT have created a duplicate "Others: Gout" row alongside MedicalHistories
        var activeHistories = await context.PatientMedicalHistories
            .Where(m => m.PatientId == registered.Id)
            .ToListAsync();
        activeHistories.Should().HaveCount(2);
        activeHistories.Should().NotContain(m => m.ConditionTitle == "Others: Gout");

        // Clearing alerts via empty string resolves existing alerts and clears HasActiveSafetyAlert
        updated.Alerts.Should().BeNull();
        var reloadedPatient = await context.Patients.FirstAsync(p => p.Id == registered.Id);
        reloadedPatient.HasActiveSafetyAlert.Should().BeFalse();
    }

    [Fact]
    public async Task UpdatePatient_ClearingAllStructuredAllergies_SoftDeletesExistingAllergies()
    {
        var (context, uow, sieve) = CreateInterceptorBackedContext();
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);

        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, allergyRepo: allergyRepo);
        var registered = await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Ana",
            LastName: "Dizon",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1993, 11, 8),
            Sex: "Female",
            CivilStatus: "Single",
            ContactNumber: "09170009988",
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
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Ibuprofen", Severity: "Moderate", IsAnaphylactic: false)
            }), CancellationToken.None);

        context.ChangeTracker.Clear();

        var updateHandler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            allergyRepo: allergyRepo);

        var updated = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Ana",
            LastName: "Dizon",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1993, 11, 8),
            Sex: "Female",
            CivilStatus: "Single",
            ContactNumber: "09170009988",
            Email: null,
            Allergies: "",
            StructuredAllergies: new List<CreateAllergyRequest>()), CancellationToken.None);

        updated.Allergies.Should().BeNull();
        updated.StructuredAllergies.Should().BeEmpty();
        (await context.PatientAllergies.Where(a => a.PatientId == registered.Id).ToListAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task UpdatePatient_ClearingPhilHealthPin_WithSeededMembership_NeverPersistsNullMemberPin()
    {
        var (context, uow, sieve) = CreateInterceptorBackedContext();
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-01047",
            FirstName = "Clarisse",
            LastName = "Alvarado",
            DateOfBirth = new DateOnly(1977, 6, 4),
            Sex = BiologicalSex.Female,
            ContactNumber = "09171112222",
            PhilHealthNumber = "19-124741822-9"
        };
        var membership = new PatientPhilHealthMembership
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            MemberType = PhilHealthMemberType.MM,
            MemberPin = "19-124741822-9"
        };

        await context.Patients.AddAsync(patient);
        await context.PatientPhilHealthMemberships.AddAsync(membership);
        await uow.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, clinicContext: _clinicContext);
        var updated = await updateHandler.Handle(new UpdateClinicPatientCommand(
            Id: patientId,
            FirstName: "Clarisse",
            LastName: "Alvarado",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1977, 6, 4),
            Sex: "Female",
            CivilStatus: "Single",
            ContactNumber: "09171112222",
            Email: null,
            PhilHealthNumber: null), CancellationToken.None);

        updated.PhilHealthNumber.Should().BeNull();
        var rawMembership = await context.PatientPhilHealthMemberships.IgnoreQueryFilters()
            .SingleAsync(m => m.PatientId == patientId);
        rawMembership.MemberPin.Should().NotBeNull("PatientPhilHealthMemberships.MemberPin has a NOT NULL constraint in PostgreSQL");
        rawMembership.IsDeleted.Should().BeTrue();
    }
}
