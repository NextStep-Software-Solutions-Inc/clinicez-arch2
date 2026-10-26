using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.CustomFields;

public class BoundaryModeCustomFieldsTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_test_boundary";
    private readonly IClinicContext _clinicContext;

    public BoundaryModeCustomFieldsTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("pastOrToday")]
    [InlineData("futureOrToday")]
    [InlineData("futureOnly")]
    [InlineData("any")]
    public void CreateValidator_AllowedBoundaryModes_PassValidation(string? mode)
    {
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "exam_date",
            Label: "Exam Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: mode);

        var result = validator.TestValidate(command);
        result.ShouldNotHaveValidationErrorFor(x => x.BoundaryMode);
    }

    [Theory]
    [InlineData("pastOnly")]
    [InlineData("tomorrow")]
    [InlineData("invalid_mode")]
    [InlineData("PASTORTODAY")]
    [InlineData("FutureOrToday")]
    public void CreateValidator_DisallowedBoundaryModes_FailValidation(string invalidMode)
    {
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "exam_date",
            Label: "Exam Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: invalidMode);

        var result = validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.BoundaryMode)
            .WithErrorMessage("BoundaryMode must be one of: pastOrToday, futureOrToday, futureOnly, any.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("pastOrToday")]
    [InlineData("futureOrToday")]
    [InlineData("futureOnly")]
    [InlineData("any")]
    public void UpdateValidator_AllowedBoundaryModes_PassValidation(string? mode)
    {
        var validator = new UpdateCustomFieldDefinitionCommandValidator();
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Exam Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: mode);

        var result = validator.TestValidate(command);
        result.ShouldNotHaveValidationErrorFor(x => x.BoundaryMode);
    }

    [Theory]
    [InlineData("pastOnly")]
    [InlineData("yesterday")]
    [InlineData("ANY")]
    public void UpdateValidator_DisallowedBoundaryModes_FailValidation(string invalidMode)
    {
        var validator = new UpdateCustomFieldDefinitionCommandValidator();
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Exam Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: invalidMode);

        var result = validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.BoundaryMode)
            .WithErrorMessage("BoundaryMode must be one of: pastOrToday, futureOrToday, futureOnly, any.");
    }

    [Fact]
    public async Task CreateCustomFieldDefinition_WithBoundaryMode_PersistsAndReturnsDto()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "last_physical_exam_date",
            Label: "Date of Last Physical Examination",
            DataType: CustomFieldDataType.Date,
            Category: "Clinical",
            BoundaryMode: "pastOrToday");

        var createdDto = await createHandler.Handle(command, CancellationToken.None);

        createdDto.Should().NotBeNull();
        createdDto.FieldKey.Should().Be("last_physical_exam_date");
        createdDto.BoundaryMode.Should().Be("pastOrToday");

        // Verify query projection
        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery(), CancellationToken.None);
        var fieldDto = queried.FirstOrDefault(f => f.FieldKey == "last_physical_exam_date");
        fieldDto.Should().NotBeNull();
        fieldDto!.BoundaryMode.Should().Be("pastOrToday");
    }

    [Fact]
    public async Task UpdateCustomFieldDefinition_BoundaryMode_CanBeUpdatedAndCleared()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var updateHandler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // 1. Create with pastOrToday
        var created = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "follow_up_date",
            Label: "Follow-up Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: "pastOrToday"), CancellationToken.None);

        created.BoundaryMode.Should().Be("pastOrToday");

        // 2. Update to futureOrToday
        var updated1 = await updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: created.Id,
            Label: "Follow-up Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: "futureOrToday"), CancellationToken.None);

        updated1.BoundaryMode.Should().Be("futureOrToday");

        // 3. Clear to null
        var updated2 = await updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: created.Id,
            Label: "Follow-up Date",
            DataType: CustomFieldDataType.Date,
            BoundaryMode: null), CancellationToken.None);

        updated2.BoundaryMode.Should().BeNull();

        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery(), CancellationToken.None);
        queried.First(f => f.Id == created.Id).BoundaryMode.Should().BeNull();
    }

    [Fact]
    public async Task ReorderCustomFields_PreservesBoundaryModeInProjection()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, _clinicContext);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "date_a", Label: "Date A", DataType: CustomFieldDataType.Date, DisplayOrder: 1, BoundaryMode: "pastOrToday"), CancellationToken.None);

        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "date_b", Label: "Date B", DataType: CustomFieldDataType.Date, DisplayOrder: 2, BoundaryMode: "futureOnly"), CancellationToken.None);

        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand(
            OrderedIds: new List<Guid> { f2.Id, f1.Id }), CancellationToken.None);

        reordered.Should().HaveCount(2);
        reordered.First(f => f.Id == f1.Id).BoundaryMode.Should().Be("pastOrToday");
        reordered.First(f => f.Id == f2.Id).BoundaryMode.Should().Be("futureOnly");
    }

    [Fact]
    public async Task UpdateClinicPatient_ClearingCustomFieldWithExplicitNull_OverwritesPersistedValue()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var updHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, null, _clinicContext);

        // Register patient with custom field
        var regCommand = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 4, 12),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: "maria@example.ph",
            AddressLine: "123 Main St",
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
            CustomFields: new Dictionary<string, object?>
            {
                ["last_physical_exam_date"] = "2026-01-15",
                ["other_info"] = "Sample note"
            });

        var created = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var savedPatient = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);
        savedPatient.CustomFields.Should().NotBeNull();
        savedPatient.CustomFields["last_physical_exam_date"]?.ToString().Should().Be("2026-01-15");
        savedPatient.CustomFields["other_info"]?.ToString().Should().Be("Sample note");

        // Act: Update with explicit null for last_physical_exam_date
        var updCommand = new UpdateClinicPatientCommand(
            Id: created.Id,
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 4, 12),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: "maria@example.ph",
            CustomFields: new Dictionary<string, object?>
            {
                ["last_physical_exam_date"] = null // Explicit clearing!
            });

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert: last_physical_exam_date is explicitly null, other_info is preserved (additive merge)
        reloaded.CustomFields["last_physical_exam_date"].Should().BeNull();
        reloaded.CustomFields["other_info"]?.ToString().Should().Be("Sample note");
    }

    [Fact]
    public async Task UpdateClinicPatient_OmittingCustomField_PreservesPersistedValue()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var updHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, null, _clinicContext);

        // Register patient with custom field
        var regCommand = new RegisterClinicPatientCommand(
            FirstName: "Jose",
            LastName: "Rizal",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 6, 19),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09181112222",
            Email: "jose@example.ph",
            AddressLine: "Calamba",
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
            CustomFields: new Dictionary<string, object?>
            {
                ["last_physical_exam_date"] = "2025-10-10"
            });

        var created = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act: Update without mentioning last_physical_exam_date at all
        var updCommand = new UpdateClinicPatientCommand(
            Id: created.Id,
            FirstName: "Jose",
            LastName: "Rizal",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 6, 19),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09181112222",
            Email: "jose@example.ph",
            CustomFields: new Dictionary<string, object?>
            {
                ["unrelated_field"] = "Value 1"
            });

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert: omitted key retains its previous value in the DB!
        reloaded.CustomFields["last_physical_exam_date"]?.ToString().Should().Be("2025-10-10");
        reloaded.CustomFields["unrelated_field"]?.ToString().Should().Be("Value 1");
    }
}
