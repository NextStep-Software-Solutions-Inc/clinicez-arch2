using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Test Suite for Issue #77 (Adversarial Demographic Clearing & Additive Merge).
/// Validates:
/// 1. Multi-field clearing (Date, Text, Number, Select, Boolean) via null values in request.CustomFields.
/// 2. Verification that previously saved keys set to null are persisted as null in PostgreSQL JSONB.
/// 3. Omitted keys retain existing database values without corruption.
/// 4. System keys (yakap_enlistments, member_type, principal_* details, philhealth_profile) are 100% preserved.
/// 5. Untouched optional keys never present in DB do not get polluted with null.
/// </summary>
public class ChallengerIssue77DemographicClearingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_issue77_clear";
    private readonly IClinicContext _clinicContext;

    public ChallengerIssue77DemographicClearingTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private (ApplicationDbContext Context, IUnitOfWork Uow, IRepository<ClinicPatient> PatientRepo, RegisterClinicPatientCommandHandler RegHandler, UpdateClinicPatientCommandHandler UpdHandler)
        CreateHarness(string? sharedDbName = null)
    {
        var (context, uow, sieve) = sharedDbName != null
            ? TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext)
            : TestDbHelper.CreateTestContext(_clinicContext);

        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var updHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, null, _clinicContext);
        return (context, uow, patientRepo, regHandler, updHandler);
    }

    private static void AssertNullValue(object? value)
    {
        if (value == null) return;
        if (value is JsonElement je)
        {
            je.ValueKind.Should().Be(JsonValueKind.Null);
            return;
        }
        value.Should().BeNull();
    }

    private static RegisterClinicPatientCommand BuildRegisterCommand(
        string firstName,
        string lastName,
        DateOnly dob,
        string gender,
        string civilStatus,
        string contactNumber,
        string email,
        Dictionary<string, object?>? customFields = null,
        string? middleName = null,
        string? suffix = null)
    {
        return new RegisterClinicPatientCommand(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: middleName,
            Suffix: suffix,
            DateOfBirth: dob,
            Gender: gender,
            CivilStatus: civilStatus,
            ContactNumber: contactNumber,
            Email: email,
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
            CustomFields: customFields
        );
    }

    [Fact]
    public async Task ADV_Issue77_01_MultiFieldClearing_AcrossAllDataTypes_PersistsNullInDatabase()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var initialFields = new Dictionary<string, object?>
        {
            ["last_physical_exam_date"] = "2025-06-15", // Date
            ["clinical_notes"] = "Healthy heart and lungs", // Text
            ["risk_score"] = 18.5, // Number
            ["donor_status"] = "Eligible", // Select
            ["consent_research"] = true, // Boolean
            ["unrelated_system_key"] = "DO_NOT_TOUCH"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Maria",
            lastName: "Santos",
            dob: new DateOnly(1992, 5, 20),
            gender: "Female",
            civilStatus: "Married",
            contactNumber: "09171234567",
            email: "maria.santos@example.ph",
            customFields: initialFields,
            middleName: "Clara"
        );

        var registered = await regHandler.Handle(regCommand, CancellationToken.None);

        // Verify initial state
        context.ChangeTracker.Clear();
        var patientInDb = await patientRepo.Query().FirstAsync(p => p.Id == registered.Id);
        patientInDb.CustomFields["last_physical_exam_date"]?.ToString().Should().Be("2025-06-15");
        patientInDb.CustomFields["consent_research"]?.ToString()?.ToLower().Should().Be("true");

        // Act: User clears all 5 custom fields simultaneously (sets to null)
        var clearedCustomFields = new Dictionary<string, object?>
        {
            ["last_physical_exam_date"] = null,
            ["clinical_notes"] = null,
            ["risk_score"] = null,
            ["donor_status"] = null,
            ["consent_research"] = null
            // unrelated_system_key is omitted to test additive merge retention
        };

        var updCommand = new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: "Clara",
            Suffix: null,
            DateOfBirth: new DateOnly(1992, 5, 20),
            Gender: "Female",
            CivilStatus: "Married",
            ContactNumber: "09171234567",
            Email: "maria.santos@example.ph",
            CustomFields: clearedCustomFields
        );

        var updated = await updHandler.Handle(updCommand, CancellationToken.None);

        // Assert: Return DTO has null for cleared fields
        updated.CustomFields.Should().NotBeNull();
        AssertNullValue(updated.CustomFields!["last_physical_exam_date"]);
        AssertNullValue(updated.CustomFields["clinical_notes"]);
        AssertNullValue(updated.CustomFields["risk_score"]);
        AssertNullValue(updated.CustomFields["donor_status"]);
        AssertNullValue(updated.CustomFields["consent_research"]);
        updated.CustomFields["unrelated_system_key"]?.ToString().Should().Be("DO_NOT_TOUCH");

        // Assert: Persistence reload from EF Core context
        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == registered.Id);
        AssertNullValue(reloaded.CustomFields["last_physical_exam_date"]);
        AssertNullValue(reloaded.CustomFields["clinical_notes"]);
        AssertNullValue(reloaded.CustomFields["risk_score"]);
        AssertNullValue(reloaded.CustomFields["donor_status"]);
        AssertNullValue(reloaded.CustomFields["consent_research"]);
        reloaded.CustomFields["unrelated_system_key"]?.ToString().Should().Be("DO_NOT_TOUCH");
    }

    [Fact]
    public async Task ADV_Issue77_02_UntouchedOptionalFields_AreNotPollutedWithNull()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        // Patient only ever had 1 field
        var initialFields = new Dictionary<string, object?>
        {
            ["last_physical_exam_date"] = "2025-06-15"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Jose",
            lastName: "Rizal",
            dob: new DateOnly(1985, 6, 19),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09189998888",
            email: "jose.rizal@example.ph",
            customFields: initialFields,
            middleName: "P"
        );

        var registered = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act: Form sends an update where only last_physical_exam_date is updated.
        // Untouched fields that never existed in DB are omitted from the payload.
        var updatePayload = new Dictionary<string, object?>
        {
            ["last_physical_exam_date"] = "2026-02-10"
        };

        var updCommand = new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Jose",
            LastName: "Rizal",
            MiddleName: "P",
            Suffix: null,
            DateOfBirth: new DateOnly(1985, 6, 19),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09189998888",
            Email: "jose.rizal@example.ph",
            CustomFields: updatePayload
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == registered.Id);

        // Assert: Database only contains last_physical_exam_date, zero null pollution keys
        reloaded.CustomFields.Should().ContainSingle();
        reloaded.CustomFields.Should().ContainKey("last_physical_exam_date");
        reloaded.CustomFields["last_physical_exam_date"]?.ToString().Should().Be("2026-02-10");
        reloaded.CustomFields.ContainsKey("optional_unused_field_1").Should().BeFalse();
        reloaded.CustomFields.ContainsKey("optional_unused_field_2").Should().BeFalse();
    }

    [Fact]
    public async Task ADV_Issue77_03_SystemKeys_YakapEnlistmentsAndPhilHealth_100PercentPreserved()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var enlistmentData = new List<object>
        {
            new Dictionary<string, object>
            {
                ["year"] = "2026",
                ["packageType"] = "KONSULTA",
                ["status"] = "ENROLLED"
            }
        };

        var initialFields = new Dictionary<string, object?>
        {
            ["yakap_enlistments"] = enlistmentData,
            ["member_type"] = "DD",
            ["principal_member_pin"] = "12-345678901-2",
            ["principal_full_name"] = "Rizal, Francisco",
            ["principal_relationship"] = "F",
            ["principal_dob"] = "1950-05-11",
            ["philhealth_profile"] = new Dictionary<string, object>
            {
                ["memberType"] = "DD",
                ["memberPin"] = "12-345678901-2"
            },
            ["last_physical_exam_date"] = "2025-01-01"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Paciano",
            lastName: "Rizal",
            dob: new DateOnly(1980, 3, 9),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09175554444",
            email: "paciano@example.ph",
            customFields: initialFields,
            middleName: "M"
        );

        var registered = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act: User clears last_physical_exam_date to null
        var updateCustomFields = new Dictionary<string, object?>
        {
            ["last_physical_exam_date"] = null,
            ["yakap_enlistments"] = enlistmentData, // Preserved by frontend merger
            ["member_type"] = "DD",
            ["principal_member_pin"] = "12-345678901-2",
            ["principal_full_name"] = "Rizal, Francisco",
            ["principal_relationship"] = "F",
            ["principal_dob"] = "1950-05-11",
            ["philhealth_profile"] = new Dictionary<string, object>
            {
                ["memberType"] = "DD",
                ["memberPin"] = "12-345678901-2"
            }
        };

        var updCommand = new UpdateClinicPatientCommand(
            Id: registered.Id,
            FirstName: "Paciano",
            LastName: "Rizal",
            MiddleName: "M",
            Suffix: null,
            DateOfBirth: new DateOnly(1980, 3, 9),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09175554444",
            Email: "paciano@example.ph",
            CustomFields: updateCustomFields
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        // Assert
        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == registered.Id);

        AssertNullValue(reloaded.CustomFields["last_physical_exam_date"]);
        reloaded.CustomFields.Should().ContainKey("yakap_enlistments");
        reloaded.CustomFields["member_type"]?.ToString().Should().Be("DD");
        reloaded.CustomFields["principal_member_pin"]?.ToString().Should().Be("12-345678901-2");
        reloaded.CustomFields["principal_full_name"]?.ToString().Should().Be("Rizal, Francisco");
        reloaded.CustomFields["principal_relationship"]?.ToString().Should().Be("F");
        reloaded.CustomFields["principal_dob"]?.ToString().Should().Be("1950-05-11");
        reloaded.CustomFields.Should().ContainKey("philhealth_profile");
    }
}
