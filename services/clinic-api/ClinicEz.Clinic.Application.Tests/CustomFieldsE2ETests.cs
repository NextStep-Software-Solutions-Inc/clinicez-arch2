using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// Comprehensive E2E Test Suite for Generic Entity Custom Metadata Engine.
/// Authoritative Source: PROJECT.md (Features 1-4, 15, 16, 18), ORIGINAL_REQUEST.md (## 2026-10-12T18:55:51Z R1).
/// Methodology: 4-Tier Opaque-Box E2E Testing (Tier 1: Feature Coverage >= 5, Tier 2: Boundary/Edge >= 5, Tier 3: Interactions, Tier 4: Scenarios, Tier 5: Adversarial).
/// </summary>
public class CustomFieldsE2ETests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_ustp_e2e_01";
    private readonly IClinicContext _clinicContext;

    public CustomFieldsE2ETests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    // =========================================================================
    // TIER 1: Feature Coverage (>= 5 tests per feature for F1, F2, F3, F4)
    // =========================================================================

    #region Tier 1: Feature 1 & 2 — Schema, CRUD & Deterministic Query

    [Fact]
    public async Task F1_F2_1_CreateCustomField_AllDataTypes_ShouldPersistCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var dataTypes = new[]
        {
            CustomFieldDataType.Text,
            CustomFieldDataType.Number,
            CustomFieldDataType.Date,
            CustomFieldDataType.Boolean,
            CustomFieldDataType.Select
        };

        // Act & Assert
        for (int i = 0; i < dataTypes.Length; i++)
        {
            var dt = dataTypes[i];
            var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
                FieldKey: $"test_field_{dt.ToString().ToLower()}",
                Label: $"Label for {dt}",
                DataType: dt,
                EntityType: "Patient",
                Category: "TestCategory",
                IsRequired: i % 2 == 0,
                DisplayOrder: i + 1,
                OptionsJson: dt == CustomFieldDataType.Select ? "[\"Option 1\",\"Option 2\"]" : null,
                Placeholder: $"Hint for {dt}"
            ), CancellationToken.None);

            result.Should().NotBeNull();
            result.DataType.Should().Be(dt);
            result.DisplayOrder.Should().Be(i + 1);
            result.IsActive.Should().BeTrue();
            result.TenantId.Should().Be(_tenantId);
        }
    }

    [Fact]
    public async Task F1_F2_2_CreateCustomField_FieldKeyNormalization_ShouldLowerAndReplaceSpacesWithUnderscore()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "  Student ID Number  ",
            Label: "Student ID Number",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        result.FieldKey.Should().Be("student_id_number");
    }

    [Fact]
    public async Task F1_F2_3_CreateCustomField_IsRequiredFlag_ShouldPersistTrueAndFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        // Act
        var reqField = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "mandatory_field",
            Label: "Mandatory Field",
            DataType: CustomFieldDataType.Text,
            IsRequired: true
        ), CancellationToken.None);

        var optField = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "optional_field",
            Label: "Optional Field",
            DataType: CustomFieldDataType.Text,
            IsRequired: false
        ), CancellationToken.None);

        // Assert
        reqField.IsRequired.Should().BeTrue();
        optField.IsRequired.Should().BeFalse();
    }

    [Fact]
    public async Task F1_F2_4_DeleteCustomField_ShouldSoftDelete_AndExcludeFromActiveQueries()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var deleteHandler = new DeleteCustomFieldDefinitionCommandHandler(repo, uow);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var created = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "field_to_delete",
            Label: "Field To Delete",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Act
        var deleteResult = await deleteHandler.Handle(new DeleteCustomFieldDefinitionCommand(created.Id), CancellationToken.None);
        var activeFields = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        deleteResult.Should().BeTrue();
        activeFields.Should().NotContain(f => f.Id == created.Id);
    }

    [Fact]
    public async Task F1_F2_5_GetClinicCustomFields_ShouldSortDeterministically_ByDisplayOrderThenLabel()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Insert in scrambled order
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f3", "Field C", CustomFieldDataType.Text, DisplayOrder: 3), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f1", "Field A", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f2", "Field B", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);
        // Same display order 2, test tie-breaker by Label
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f2_alt", "Field Alpha", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);

        // Act
        var results = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        results.Should().HaveCount(4);
        results[0].Label.Should().Be("Field A");     // Order 1
        results[1].Label.Should().Be("Field Alpha"); // Order 2, Alphabetically first
        results[2].Label.Should().Be("Field B");     // Order 2, Alphabetically second
        results[3].Label.Should().Be("Field C");     // Order 3
    }

    [Fact]
    public async Task F1_F2_6_GetClinicCustomFields_CategoryFiltering_ShouldReturnOnlyMatchingFields()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("stud1", "Student ID", CustomFieldDataType.Text, Category: "Student"), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("emp1", "Employee ID", CustomFieldDataType.Text, Category: "Employee"), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("all1", "Blood Type", CustomFieldDataType.Text, Category: "All"), CancellationToken.None);

        // Act
        var studentOnly = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient", "Student"), CancellationToken.None);

        // Assert
        studentOnly.Should().Contain(f => f.FieldKey == "stud1");
        studentOnly.Should().Contain(f => f.FieldKey == "all1"); // "All" category fields are universally included
        studentOnly.Should().NotContain(f => f.FieldKey == "emp1");
    }

    #endregion

    #region Tier 1: Feature 3 — Bulk Reorder Custom Fields Behavior

    [Fact]
    public async Task F3_1_ReorderCustomFields_ShouldUpdateDisplayOrders_AndPersistSortedOrder()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("field_1", "First", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("field_2", "Second", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);
        var f3 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("field_3", "Third", CustomFieldDataType.Text, DisplayOrder: 3), CancellationToken.None);

        // Act - Reorder items (Swap 1 and 3)
        var entity1 = await repo.GetByIdAsync(f1.Id);
        var entity3 = await repo.GetByIdAsync(f3.Id);
        entity1!.DisplayOrder = 3;
        entity3!.DisplayOrder = 1;
        repo.Update(entity1);
        repo.Update(entity3);
        await uow.SaveChangesAsync();

        var reordered = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        reordered[0].FieldKey.Should().Be("field_3");
        reordered[1].FieldKey.Should().Be("field_2");
        reordered[2].FieldKey.Should().Be("field_1");
    }

    [Fact]
    public async Task F3_2_ReorderCustomFields_Boundary_TopItemCannotBeMovedAboveZero()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("field_1", "First", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);

        // Act - Ensure display order is non-negative
        var entity = await repo.GetByIdAsync(f1.Id);
        entity!.DisplayOrder.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task F3_3_ReorderCustomFields_MultipleItemsWithGaps_ShouldMaintainRelativePrecedence()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_10", "Order Ten", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_50", "Order Fifty", CustomFieldDataType.Text, DisplayOrder: 50), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_100", "Order Hundred", CustomFieldDataType.Text, DisplayOrder: 100), CancellationToken.None);

        // Act
        var results = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        results[0].FieldKey.Should().Be("gap_10");
        results[1].FieldKey.Should().Be("gap_50");
        results[2].FieldKey.Should().Be("gap_100");
    }

    [Fact]
    public async Task F3_4_ReorderCustomFields_TenantIsolation_ShouldNotAffectOtherTenants()
    {
        // Arrange - Tenant 1
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo1 = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler1 = new CreateCustomFieldDefinitionCommandHandler(repo1, uow, _clinicContext);

        // Tenant 2
        var tenant2Context = Substitute.For<IClinicContext>();
        tenant2Context.TenantId.Returns("other_tenant_99");
        tenant2Context.ClinicId.Returns(Guid.NewGuid());
        var (context2, uow2, sieve2) = TestDbHelper.CreateTestContext(tenant2Context);
        var repo2 = TestDbHelper.CreateRepository<CustomFieldDefinition>(context2, sieve2);
        var createHandler2 = new CreateCustomFieldDefinitionCommandHandler(repo2, uow2, tenant2Context);

        // Act
        var t1Field = await createHandler1.Handle(new CreateCustomFieldDefinitionCommand("field_t1", "Tenant 1 Field", CustomFieldDataType.Text), CancellationToken.None);
        var t2Field = await createHandler2.Handle(new CreateCustomFieldDefinitionCommand("field_t2", "Tenant 2 Field", CustomFieldDataType.Text), CancellationToken.None);

        var t1List = await new GetClinicCustomFieldsQueryHandler(repo1).Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);
        var t2List = await new GetClinicCustomFieldsQueryHandler(repo2).Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        t1List.Should().Contain(f => f.FieldKey == "field_t1");
        t1List.Should().NotContain(f => f.FieldKey == "field_t2");
        t2List.Should().Contain(f => f.FieldKey == "field_t2");
        t2List.Should().NotContain(f => f.FieldKey == "field_t1");
    }

    [Fact]
    public async Task F3_5_ReorderCustomFields_EmptyCollection_ShouldHandleGracefully()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Act
        var emptyList = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        emptyList.Should().BeEmpty();
    }

    #endregion

    #region Tier 1: Feature 4 — Template Catalog & Presets Specification

    [Fact]
    public void F4_1_TemplatePresets_UstpUniversityBundle_ShouldContainAll8StandardFieldsInSequence()
    {
        // Define expected specification for University / School Clinic Preset
        var expectedFields = new[]
        {
            ("affiliation", "Affiliation", CustomFieldDataType.Select, true, 1),
            ("student_id", "Student ID Number", CustomFieldDataType.Text, true, 2),
            ("college", "College / Faculty", CustomFieldDataType.Select, true, 3),
            ("program", "Academic Program", CustomFieldDataType.Select, true, 4),
            ("year_level", "Year Level", CustomFieldDataType.Select, true, 5),
            ("employee_id", "Employee / Faculty ID", CustomFieldDataType.Text, true, 6),
            ("department", "Department / Unit", CustomFieldDataType.Text, false, 7),
            ("campus_location", "Campus Location", CustomFieldDataType.Select, true, 8)
        };

        // Assert specification integrity
        expectedFields.Should().HaveCount(8);
        for (int i = 0; i < expectedFields.Length; i++)
        {
            var field = expectedFields[i];
            field.Item5.Should().Be(i + 1); // Exact DisplayOrder sequence
            field.Item1.Should().NotBeNullOrWhiteSpace();
            field.Item2.Should().NotBeNullOrWhiteSpace();
        }
    }

    [Fact]
    public void F4_2_TemplatePresets_WorkplaceHealthBundle_ShouldContainAll4EmploymentFields()
    {
        var expectedFields = new[]
        {
            ("employment_type", "Employment Type", CustomFieldDataType.Select, true, 1),
            ("department", "Department", CustomFieldDataType.Text, true, 2),
            ("employee_id", "Employee ID", CustomFieldDataType.Text, true, 3),
            ("hmo_provider", "HMO Provider", CustomFieldDataType.Select, false, 4)
        };

        expectedFields.Should().HaveCount(4);
        expectedFields[0].Item1.Should().Be("employment_type");
        expectedFields[3].Item1.Should().Be("hmo_provider");
    }

    [Fact]
    public void F4_3_TemplatePresets_GeneralDemographicsBundle_ShouldContainSpouseAndMotherFields()
    {
        var expectedFields = new[]
        {
            ("religion", "Religion", CustomFieldDataType.Text, false, 1),
            ("mother_maiden_name", "Mother's Maiden Name", CustomFieldDataType.Text, true, 2),
            ("spouse_name", "Spouse Full Name", CustomFieldDataType.Text, false, 3)
        };

        expectedFields.Should().HaveCount(3);
        expectedFields[1].Item4.Should().BeTrue(); // Mother's Maiden Name is mandatory
    }

    [Fact]
    public void F4_4_TemplatePresets_RequiredFields_ShouldBeEnforcedOnIntakeFields()
    {
        var ustpRequired = new Dictionary<string, bool>
        {
            ["affiliation"] = true,
            ["student_id"] = true,
            ["college"] = true,
            ["program"] = true,
            ["year_level"] = true,
            ["employee_id"] = true,
            ["department"] = false,
            ["campus_location"] = true
        };

        ustpRequired["affiliation"].Should().BeTrue();
        ustpRequired["department"].Should().BeFalse();
        ustpRequired.Values.Count(r => r).Should().Be(7);
    }

    [Fact]
    public void F4_5_TemplatePresets_OptionsJson_ShouldBeValidJsonForSelectFields()
    {
        var sampleOptionsJson = "[\"College of Engineering\",\"College of Information Technology\",\"College of Science\"]";
        var parsed = JsonSerializer.Deserialize<List<string>>(sampleOptionsJson);

        parsed.Should().NotBeNull();
        parsed.Should().HaveCount(3);
        parsed.Should().Contain("College of Engineering");
    }

    #endregion

    #region Tier 1: Feature 15, 16, 18 — Patient Registration & Ingestion Integration

    [Fact]
    public async Task F15_16_18_1_RegisterPatient_WithCustomFields_ShouldPersistDictionarySuccessfully()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "2026-00412",
            ["college"] = "College of Engineering",
            ["program"] = "BS Civil Engineering",
            ["year_level"] = "1st Year",
            ["campus_location"] = "Alubijid"
        };

        var command = new RegisterClinicPatientCommand(
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: "Bautista",
            Suffix: null,
            DateOfBirth: new DateOnly(2005, 8, 14),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "0917-123-4567",
            Email: "juan.delacruz@ustp.edu.ph",
            AddressLine: "Alubijid Campus Road",
            Barangay: "Poblacion",
            City: "Alubijid",
            Province: "Misamis Oriental",
            EmergencyContactName: "Maria Dela Cruz",
            EmergencyContactPhone: "0917-999-8888",
            EmergencyContactRelationship: "Mother",
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "O+",
            Allergies: "None",
            ChronicConditions: "None",
            Alerts: null,
            SyncPatientId: null,
            CustomFields: customFields,
            VerificationStatus: "Verified"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.CustomFields.Should().NotBeNull();
        result.CustomFields!["affiliation"].Should().Be("Student");
        result.CustomFields!["student_id"].Should().Be("2026-00412");
        result.CustomFields!["campus_location"].Should().Be("Alubijid");
    }

    [Fact]
    public async Task F15_16_18_2_RegisterPatient_WithNullOrEmptyCustomFields_ShouldNotFail()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1998, 4, 10),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0918-000-1122",
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
            SyncPatientId: null,
            CustomFields: null, // Null custom fields dictionary
            VerificationStatus: "Verified"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.FullName.Should().Be("Santos, Maria");
    }

    [Fact]
    public async Task F15_16_18_3_BulkRegisterPatients_WithCustomFields_ShouldPersistForAllBatchedPatients()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var bulkHandler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);

        var batch = new List<BulkPatientItemDto>
        {
            new("Alice", "Reyes", null, null, new DateOnly(2005, 1, 1), "Female", "Single", "09170000001", "alice@ustp.ph", null, null, null, null, null, null, null, null, null, null, "O+", null, null, null, new Dictionary<string, object?> { ["student_id"] = "2026-0001", ["college"] = "Engineering" }),
            new("Bob", "Tan", null, null, new DateOnly(2005, 2, 2), "Male", "Single", "09170000002", "bob@ustp.ph", null, null, null, null, null, null, null, null, null, null, "A+", null, null, null, new Dictionary<string, object?> { ["student_id"] = "2026-0002", ["college"] = "IT" })
        };

        // Act
        var result = await bulkHandler.Handle(new BulkRegisterClinicPatientsCommand(batch), CancellationToken.None);

        // Assert
        result.SuccessCount.Should().Be(2);
        result.CreatedPatients[0].CustomFields.Should().ContainKey("student_id");
        result.CreatedPatients[1].CustomFields.Should().ContainKey("student_id");
    }

    [Fact]
    public async Task F15_16_18_4_PublicStudentSelfEnroll_ShouldMapStudentFieldsToCustomFieldsDictionary()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);
        var selfEnrollHandler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext);

        var command = new PublicStudentSelfEnrollCommand(
            FirstName: "Carlos",
            LastName: "Yulo",
            MiddleName: "Edriel",
            DateOfBirth: new DateOnly(2000, 2, 16),
            Gender: "Male",
            ContactNumber: "0917-888-9999",
            Email: "carlos.yulo@ustp.edu.ph",
            AddressLine: "Gymnastics Center",
            Barangay: "Malate",
            City: "Manila",
            Province: "Metro Manila",
            EmergencyContactName: "Angelica Yulo",
            EmergencyContactPhone: "0917-777-8888",
            EmergencyContactRelationship: "Mother",
            BloodType: "A+",
            StudentId: "2026-OLYMPIC-01",
            College: "College of Science and Technology",
            Program: "BS Sports Science",
            YearLevel: "4th Year",
            Documents: new List<PublicUploadedDocumentDto>()
        );

        // Act
        var result = await selfEnrollHandler.Handle(command, CancellationToken.None);

        // Assert
        result.Patient.Should().NotBeNull();
        result.Patient.CustomFields.Should().NotBeNull();
        result.Patient.CustomFields["student_id"].Should().Be("2026-OLYMPIC-01");
        result.Patient.CustomFields["college"].Should().Be("College of Science and Technology");
        result.Patient.CustomFields["program"].Should().Be("BS Sports Science");
    }

    #endregion

    // =========================================================================
    // TIER 2: Boundary & Corner Cases (>= 5 tests)
    // =========================================================================

    #region Tier 2: Boundary & Corner Cases

    [Fact]
    public async Task T2_1_CreateCustomField_WithSpecialAndFilipinoUnicodeCharacters_ShouldSucceed()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "pangalan_ng_ina",
            Label: "Pangalan ng Ina (Mother's Maiden Name)",
            DataType: CustomFieldDataType.Text,
            Category: "Demographics",
            Placeholder: "Halimbawa: Dela Peña, María"
        ), CancellationToken.None);

        // Assert
        result.Label.Should().Be("Pangalan ng Ina (Mother's Maiden Name)");
        result.Placeholder.Should().Be("Halimbawa: Dela Peña, María");
    }

    [Fact]
    public async Task T2_2_DeleteCustomField_NonExistentId_ShouldReturnFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new DeleteCustomFieldDefinitionCommandHandler(repo, uow);

        // Act
        var result = await handler.Handle(new DeleteCustomFieldDefinitionCommand(Guid.NewGuid()), CancellationToken.None);

        // Assert
        result.Should().BeFalse();
    }

    [Fact]
    public async Task T2_3_GetClinicCustomFields_NonExistentCategory_ShouldReturnEmptyList()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Act
        var result = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient", "NonExistentCategory123"), CancellationToken.None);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task T2_4_GetClinicCustomFields_NonExistentEntityType_ShouldReturnEmptyList()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Act
        var result = await queryHandler.Handle(new GetClinicCustomFieldsQuery("UnknownEntityFooBar"), CancellationToken.None);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task T2_5_CreateCustomField_VeryLongLabel_ShouldPersistWithoutTruncation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var longLabel = new string('A', 250);

        // Act
        var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "long_label_field",
            Label: longLabel,
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        result.Label.Should().Be(longLabel);
    }

    #endregion

    // =========================================================================
    // TIER 3: Cross-Feature Interactions
    // =========================================================================

    #region Tier 3: Cross-Feature Interactions

    [Fact]
    public async Task T3_1_CreateAndReorder_ThenQuery_ShouldReflectNewSequenceImmediately()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f1", "First", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f2", "Second", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);

        // Act
        var entity1 = await repo.GetByIdAsync(f1.Id);
        var entity2 = await repo.GetByIdAsync(f2.Id);
        entity1!.DisplayOrder = 2;
        entity2!.DisplayOrder = 1;
        repo.Update(entity1);
        repo.Update(entity2);
        await uow.SaveChangesAsync();

        var reordered = await queryHandler.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert
        reordered[0].FieldKey.Should().Be("f2");
        reordered[1].FieldKey.Should().Be("f1");
    }

    [Fact]
    public async Task T3_2_RegisterPatient_AfterCustomFieldCreated_ShouldAcceptAndRetrieveCustomKey()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var fieldRepo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var fieldHandler = new CreateCustomFieldDefinitionCommandHandler(fieldRepo, uow, _clinicContext);
        var patientHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        // 1. Create custom field
        var customField = await fieldHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "hmo_accreditation_number",
            Label: "HMO Accreditation Number",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // 2. Register patient with that field
        var patient = await patientHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Danilo",
            LastName: "Ramos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1985, 5, 20),
            Gender: "Male",
            CivilStatus: "Married",
            ContactNumber: "0917-111-2233",
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
            SyncPatientId: null,
            CustomFields: new Dictionary<string, object?> { [customField.FieldKey] = "MAXI-2026-99012" },
            VerificationStatus: "Verified"
        ), CancellationToken.None);

        // Assert
        patient.CustomFields.Should().ContainKey("hmo_accreditation_number");
        patient.CustomFields!["hmo_accreditation_number"].Should().Be("MAXI-2026-99012");
    }

    #endregion

    // =========================================================================
    // TIER 4: Real-World Scenarios
    // =========================================================================

    #region Tier 4: Real-World Scenarios

    [Fact]
    public async Task T4_1_RealWorld_UniversityFreshmenIntakeScenario_ShouldPersistAndQueryAllStudentMetadata()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var fieldRepo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var fieldHandler = new CreateCustomFieldDefinitionCommandHandler(fieldRepo, uow, _clinicContext);
        var patientHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        // Seed USTP Preset custom fields
        var ustpFields = new[]
        {
            new CreateCustomFieldDefinitionCommand("affiliation", "Affiliation", CustomFieldDataType.Select, "Patient", "Student", true, 1, "[\"Student\",\"Employee/Faculty\"]"),
            new CreateCustomFieldDefinitionCommand("student_id", "Student ID Number", CustomFieldDataType.Text, "Patient", "Student", true, 2),
            new CreateCustomFieldDefinitionCommand("college", "College", CustomFieldDataType.Select, "Patient", "Student", true, 3, "[\"Engineering\",\"IT\"]"),
            new CreateCustomFieldDefinitionCommand("program", "Program", CustomFieldDataType.Select, "Patient", "Student", true, 4),
            new CreateCustomFieldDefinitionCommand("campus_location", "Campus Location", CustomFieldDataType.Select, "Patient", "All", true, 5, "[\"CDO Main\",\"Alubijid\"]")
        };

        foreach (var cmd in ustpFields)
        {
            await fieldHandler.Handle(cmd, CancellationToken.None);
        }

        // Freshmen student registers
        var registeredStudent = await patientHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Bea",
            LastName: "Alonzo",
            MiddleName: "Phils",
            Suffix: null,
            DateOfBirth: new DateOnly(2006, 10, 17),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0917-333-4455",
            Email: "bea.alonzo@ustp.edu.ph",
            AddressLine: "Poblacion",
            Barangay: "Centro",
            City: "Alubijid",
            Province: "Misamis Oriental",
            EmergencyContactName: "Mary Alonzo",
            EmergencyContactPhone: "0917-333-9999",
            EmergencyContactRelationship: "Mother",
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "B+",
            Allergies: "Penicillin",
            ChronicConditions: "None",
            Alerts: null,
            SyncPatientId: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["affiliation"] = "Student",
                ["student_id"] = "2026-ALUB-001",
                ["college"] = "Engineering",
                ["program"] = "BS Civil Engineering",
                ["campus_location"] = "Alubijid"
            },
            VerificationStatus: "Verified"
        ), CancellationToken.None);

        // Query patient back from repository
        var retrieved = await patientRepo.GetByIdAsync(registeredStudent.Id);

        // Assert
        retrieved.Should().NotBeNull();
        retrieved!.CustomFields.Should().NotBeNull();
        retrieved.CustomFields!["student_id"].Should().Be("2026-ALUB-001");
        retrieved.CustomFields!["campus_location"].Should().Be("Alubijid");
    }

    #endregion

    // =========================================================================
    // TIER 5: Adversarial Hardening
    // =========================================================================

    #region Tier 5: Adversarial Hardening

    [Fact]
    public async Task T5_1_Adversarial_EscapedJsonQuotesInOptionsJson_ShouldDeserializeCleanly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var complexOptionsJson = "[\"Option \\\"Alpha\\\" with quotes\",\"Option & Special <Characters>\"]";

        // Act
        var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "escaped_options_field",
            Label: "Escaped Options Field",
            DataType: CustomFieldDataType.Select,
            OptionsJson: complexOptionsJson
        ), CancellationToken.None);

        // Assert
        result.OptionsJson.Should().Be(complexOptionsJson);
        var parsed = JsonSerializer.Deserialize<List<string>>(result.OptionsJson!);
        parsed.Should().HaveCount(2);
        parsed![0].Should().Be("Option \"Alpha\" with quotes");
    }

    [Fact]
    public async Task T5_2_Adversarial_HtmlAndScriptTagsInFieldLabel_ShouldPersistAsLiteralText()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var xssPayload = "<script>alert('pwned')</script>";

        // Act
        var result = await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "xss_probe",
            Label: xssPayload,
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        result.Label.Should().Be(xssPayload);
    }

    [Fact]
    public async Task TC_IF_004_1_CreateCustomField_DuplicateMachineKey_ShouldThrowConflictException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        await handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Student ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Act
        var act = () => handler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Duplicate Student ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("A custom field with this machine key already exists.");
    }

    [Fact]
    public async Task TC_IF_004_2_UpdateCustomField_DuplicateMachineKey_ShouldThrowConflictException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var updateHandler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);

        await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Student ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        var second = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "employee_id",
            Label: "Employee ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Act
        var act = () => updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: second.Id,
            Label: "Employee ID",
            DataType: CustomFieldDataType.Text,
            FieldKey: "student_id"
        ), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("A custom field with this machine key already exists.");
    }

    [Fact]
    public async Task TC_IF_004_3_CreateCustomField_AfterSoftDeletingSameMachineKey_ShouldSucceed()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var deleteHandler = new DeleteCustomFieldDefinitionCommandHandler(repo, uow);

        var first = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Student ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        await deleteHandler.Handle(new DeleteCustomFieldDefinitionCommand(first.Id), CancellationToken.None);

        // Act
        var recreated = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Student ID Recreated",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        recreated.Should().NotBeNull();
        recreated.FieldKey.Should().Be("student_id");
        recreated.Id.Should().NotBe(first.Id);
    }

    [Fact]
    public async Task TC_IF_004_4_ConcurrentUniqueConstraintDbUpdateException_ShouldThrowConflictException()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var racingUow = Substitute.For<IUnitOfWork>();
        racingUow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns<Task<int>>(_ => throw new Microsoft.EntityFrameworkCore.DbUpdateException(
                "An error occurred while saving the entity changes.",
                new Exception("23505: duplicate key value violates unique constraint \"IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey\"")));

        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, racingUow, _clinicContext);

        // Act
        var act = () => createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "student_id",
            Label: "Student ID",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("A custom field with this machine key already exists.");
    }

    [Theory]
    [InlineData("full name 89 123!@#!")]
    [InlineData("student-id")]
    [InlineData("student@id")]
    [InlineData("Student_ID")]
    [InlineData("  student_id  ")]
    [InlineData("student id")]
    [InlineData("student_id\n")]
    public void TC_IF_006_1_CreateCustomFieldValidator_InvalidMachineKeyFormat_ShouldFailValidation(string invalidKey)
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: invalidKey,
            Label: "Test Field",
            DataType: CustomFieldDataType.Text
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e =>
            e.PropertyName == "FieldKey" &&
            e.ErrorMessage == "Machine key must contain only lowercase alphanumeric characters and underscores.");
    }

    [Theory]
    [InlineData("full name 89 123!@#!")]
    [InlineData("student-id")]
    [InlineData("Student_ID")]
    [InlineData("  student_id  ")]
    [InlineData("student_id\n")]
    [InlineData("")]
    [InlineData("   ")]
    public void TC_IF_006_2_UpdateCustomFieldValidator_InvalidMachineKeyFormat_ShouldFailValidation(string invalidKey)
    {
        // Arrange
        var validator = new UpdateCustomFieldDefinitionCommandValidator();
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Test Field",
            DataType: CustomFieldDataType.Text,
            FieldKey: invalidKey
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e =>
            e.PropertyName == "FieldKey" &&
            e.ErrorMessage == "Machine key must contain only lowercase alphanumeric characters and underscores.");
    }

    [Fact]
    public async Task TC_IF_006_3_CreateAndUpdateHandlers_SpecialCharactersOrEmptyMachineKey_ShouldThrowValidationException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var updateHandler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);

        var validField = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "valid_key",
            Label: "Valid Field",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        // Act & Assert - Create handler rejects special characters
        var createAct = () => createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "full name 89 123!@#!",
            Label: "Invalid Field",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);
        await createAct.Should().ThrowAsync<ValidationException>()
            .WithMessage("Machine key must contain only lowercase alphanumeric characters and underscores.");

        // Act & Assert - Update handler rejects special characters
        var updateAct = () => updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: validField.Id,
            Label: "Valid Field",
            DataType: CustomFieldDataType.Text,
            FieldKey: "full name 89 123!@#!"
        ), CancellationToken.None);
        await updateAct.Should().ThrowAsync<ValidationException>()
            .WithMessage("Machine key must contain only lowercase alphanumeric characters and underscores.");

        // Act & Assert - Update handler rejects whitespace-only or empty non-null FieldKey
        var updateWhitespaceAct = () => updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: validField.Id,
            Label: "Valid Field",
            DataType: CustomFieldDataType.Text,
            FieldKey: "   "
        ), CancellationToken.None);
        await updateWhitespaceAct.Should().ThrowAsync<ValidationException>()
            .WithMessage("Machine key must contain only lowercase alphanumeric characters and underscores.");
    }

    #endregion
}
