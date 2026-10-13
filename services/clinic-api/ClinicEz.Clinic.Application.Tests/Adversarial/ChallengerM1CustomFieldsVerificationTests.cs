using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1 Custom Field Metadata Engine.
/// Authoritative Task Requirements:
/// 1. Empirically verify bulk reordering: test out-of-order, gaps, negative values, and deterministic query ordering (.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Label)).
/// 2. Empirically verify template installation idempotency: test repeated runs of template installation to ensure no duplicate keys or broken states.
/// 3. Empirically verify validation: test that invalid JSON strings in VisibilityRuleJson or ConditionalOptionsJson are rejected.
/// </summary>
public class ChallengerM1CustomFieldsVerificationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_m1_challenger";
    private readonly IClinicContext _clinicContext;

    public ChallengerM1CustomFieldsVerificationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    // =========================================================================
    // TASK 1: Bulk Reordering, Gaps, Negative Values & Deterministic Query Ordering
    // =========================================================================

    [Fact]
    public async Task Task1_1_Reorder_OutOfOrderItems_ShouldOrderStrictlyByDisplayOrder()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var fA = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_a", "Field A", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var fB = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_b", "Field B", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);
        var fC = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_c", "Field C", CustomFieldDataType.Text, DisplayOrder: 3), CancellationToken.None);
        var fD = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_d", "Field D", CustomFieldDataType.Text, DisplayOrder: 4), CancellationToken.None);

        // Act - Reorder with scrambled display orders: D=5, B=20, A=50, C=100
        var items = new List<CustomFieldOrderItem>
        {
            new(fA.Id, 50),
            new(fC.Id, 100),
            new(fD.Id, 5),
            new(fB.Id, 20)
        };
        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand("ClinicPatient", items), CancellationToken.None);

        // Assert reorder response
        reordered.Should().HaveCount(4);
        reordered[0].FieldKey.Should().Be("f_d");
        reordered[0].DisplayOrder.Should().Be(5);
        reordered[1].FieldKey.Should().Be("f_b");
        reordered[1].DisplayOrder.Should().Be(20);
        reordered[2].FieldKey.Should().Be("f_a");
        reordered[2].DisplayOrder.Should().Be(50);
        reordered[3].FieldKey.Should().Be("f_c");
        reordered[3].DisplayOrder.Should().Be(100);

        // Assert query returns identical deterministic order
        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        queried.Select(f => f.FieldKey).Should().ContainInOrder("f_d", "f_b", "f_a", "f_c");
    }

    [Fact]
    public async Task Task1_2_Reorder_WithLargeGapsAndZero_ShouldPreserveSequenceDeterministically()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_1", "Gap 1", CustomFieldDataType.Text), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_2", "Gap 2", CustomFieldDataType.Text), CancellationToken.None);
        var f3 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_3", "Gap 3", CustomFieldDataType.Text), CancellationToken.None);
        var f4 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("gap_4", "Gap 4", CustomFieldDataType.Text), CancellationToken.None);

        // Act - DisplayOrder with massive gaps: 0, 100, 10000, 999999
        var items = new List<CustomFieldOrderItem>
        {
            new(f4.Id, 0),
            new(f2.Id, 100),
            new(f1.Id, 10000),
            new(f3.Id, 999999)
        };
        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand("ClinicPatient", items), CancellationToken.None);

        // Assert
        reordered.Select(f => f.FieldKey).Should().ContainInOrder("gap_4", "gap_2", "gap_1", "gap_3");
        reordered[0].DisplayOrder.Should().Be(0);
        reordered[1].DisplayOrder.Should().Be(100);
        reordered[2].DisplayOrder.Should().Be(10000);
        reordered[3].DisplayOrder.Should().Be(999999);

        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        queried.Select(f => f.FieldKey).Should().ContainInOrder("gap_4", "gap_2", "gap_1", "gap_3");
    }

    [Fact]
    public void Task1_3_Reorder_NegativeDisplayOrder_MustBeRejectedByValidator()
    {
        // Arrange
        var validator = new ReorderCustomFieldsCommandValidator();
        var command = new ReorderCustomFieldsCommand("ClinicPatient", new List<CustomFieldOrderItem>
        {
            new(Guid.NewGuid(), -1),
            new(Guid.NewGuid(), -99)
        });

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("DisplayOrder must be 0 or greater"));
    }

    [Fact]
    public void Task1_4_CreateCustomField_NegativeDisplayOrder_MustBeRejectedByValidator()
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "neg_test",
            Label: "Negative Field",
            DataType: CustomFieldDataType.Text,
            DisplayOrder: -5
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "DisplayOrder" && e.ErrorMessage.Contains("0 or greater"));
    }

    [Fact]
    public void Task1_5_UpdateCustomField_NegativeDisplayOrder_MustBeRejectedByValidator()
    {
        // Arrange
        var validator = new UpdateCustomFieldDefinitionCommandValidator();
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Updated Field",
            DataType: CustomFieldDataType.Text,
            DisplayOrder: -1
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "DisplayOrder" && e.ErrorMessage.Contains("0 or greater"));
    }

    [Fact]
    public async Task Task1_6_DeterministicOrdering_TieBreakerByLabel_WhenDisplayOrderIsIdentical()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Three fields with exact same DisplayOrder (10), but labels in reverse alphabetical order
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_z", "Zulu Field", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_a", "Alpha Field", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_m", "Mike Field", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);
        await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_b", "Bravo Field", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);

        // Act
        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);

        // Assert - Query must sort by DisplayOrder, then by Label alphabetically
        queried.Should().HaveCount(4);
        queried[0].Label.Should().Be("Alpha Field");
        queried[1].Label.Should().Be("Bravo Field");
        queried[2].Label.Should().Be("Mike Field");
        queried[3].Label.Should().Be("Zulu Field");
    }

    [Fact]
    public async Task Task1_7_Reorder_OrderedIds_ShouldAssignSequentialDisplayOrdersStartingAtOne()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("seq_1", "Field 1", CustomFieldDataType.Text, DisplayOrder: 10), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("seq_2", "Field 2", CustomFieldDataType.Text, DisplayOrder: 20), CancellationToken.None);
        var f3 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("seq_3", "Field 3", CustomFieldDataType.Text, DisplayOrder: 30), CancellationToken.None);

        // Act - Reorder via orderedIds in reverse: f3, f1, f2
        var orderedIds = new List<Guid> { f3.Id, f1.Id, f2.Id };
        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand("ClinicPatient", orderedIds), CancellationToken.None);

        // Assert
        reordered[0].FieldKey.Should().Be("seq_3");
        reordered[0].DisplayOrder.Should().Be(1);
        reordered[1].FieldKey.Should().Be("seq_1");
        reordered[1].DisplayOrder.Should().Be(2);
        reordered[2].FieldKey.Should().Be("seq_2");
        reordered[2].DisplayOrder.Should().Be(3);

        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        queried.Select(f => f.FieldKey).Should().ContainInOrder("seq_3", "seq_1", "seq_2");
    }

    [Fact]
    public void Task1_8_Reorder_EmptyCommand_MustBeRejectedByValidator()
    {
        // Arrange
        var validator = new ReorderCustomFieldsCommandValidator();
        var command = new ReorderCustomFieldsCommand(Items: null, OrderedIds: null, EntityType: "ClinicPatient");

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("Reorder payload must contain either 'items' or 'orderedIds'"));
    }

    // =========================================================================
    // TASK 2: Template Installation Idempotency (Repeated Runs, No Duplicates)
    // =========================================================================

    [Fact]
    public async Task Task2_1_TemplateInstall_UniversityPreset_RepeatedRuns_MustBeStrictlyIdempotent()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // Act - Run 1
        var run1 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);
        run1.Should().HaveCount(8);

        // Act - Run 2
        var run2 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);
        run2.Should().HaveCount(8);

        // Act - Run 3
        var run3 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);
        run3.Should().HaveCount(8);

        // Assert - Physical DB record count must remain exactly 8
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(8);

        // Verify distinct field keys
        var distinctKeys = allInDb.Select(f => f.FieldKey.ToLowerInvariant()).Distinct().ToList();
        distinctKeys.Should().HaveCount(8);
        distinctKeys.Should().Contain("affiliation");
        distinctKeys.Should().Contain("student_id");
        distinctKeys.Should().Contain("college");
        distinctKeys.Should().Contain("program");
        distinctKeys.Should().Contain("year_level");
        distinctKeys.Should().Contain("employee_id");
        distinctKeys.Should().Contain("department");
        distinctKeys.Should().Contain("campus_location");
    }

    [Fact]
    public async Task Task2_2_TemplateInstall_WorkplaceAndGeneralPresets_RepeatedRuns_MustBeIdempotent()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // Workplace Corporate Template - 4 fields
        var wp1 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.WorkplaceCorporateKey), CancellationToken.None);
        wp1.Should().HaveCount(4);
        var wp2 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.WorkplaceCorporateKey), CancellationToken.None);
        wp2.Should().HaveCount(4);

        var wpInDb = await repo.Query().ToListAsync();
        wpInDb.Should().HaveCount(4);

        // General Demographics Template - 3 fields (shares no overlapping keys with workplace)
        var gd1 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.GeneralDemographicsKey), CancellationToken.None);
        var gd2 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.GeneralDemographicsKey), CancellationToken.None);

        // Total should be 4 + 3 = 7 fields, zero duplicates
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(7);
    }

    [Fact]
    public async Task Task2_3_TemplateInstall_WithExistingCustomFields_MustPreserveNonTemplateFields()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // 1. Clinic already has custom scholarship and dormitory fields
        var customScholarship = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "scholarship_grant", "Scholarship Grant", CustomFieldDataType.Text, "ClinicPatient", "Custom", false, 99
        ), CancellationToken.None);

        var customDorm = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "dormitory_room", "Dormitory Room", CustomFieldDataType.Text, "ClinicPatient", "Custom", false, 100
        ), CancellationToken.None);

        // 2. Install University preset (8 fields) twice
        await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);
        await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);

        // Assert - DB must contain 2 existing + 8 template = 10 fields total
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(10);
        allInDb.Should().Contain(f => f.FieldKey == "scholarship_grant");
        allInDb.Should().Contain(f => f.FieldKey == "dormitory_room");
    }

    [Fact]
    public async Task Task2_4_TemplateInstall_SoftDeletedTemplateField_MustBeRevivedWithoutDuplication()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // 1. Install template once
        await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);

        // 2. Soft-delete one of the template fields ("year_level")
        var yearLevelEntity = await repo.Query().FirstAsync(f => f.FieldKey == "year_level");
        yearLevelEntity.IsActive = false;
        yearLevelEntity.IsDeleted = true;
        yearLevelEntity.DeletedAt = DateTime.UtcNow;
        yearLevelEntity.DeletedBy = "ClinicAdmin";
        repo.Update(yearLevelEntity);
        await uow.SaveChangesAsync();

        // 3. Re-install the template
        var reinstalled = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey), CancellationToken.None);

        // Assert - year_level must be active again, total records remain 8 (no duplicate key inserted)
        reinstalled.Should().HaveCount(8);
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(8);

        var restoredYearLevel = allInDb.First(f => f.FieldKey == "year_level");
        restoredYearLevel.IsActive.Should().BeTrue();
        restoredYearLevel.IsDeleted.Should().BeFalse();
        restoredYearLevel.DeletedAt.Should().BeNull();
    }

    [Fact]
    public async Task Task2_5_TemplateInstall_PatientIntakeAddressAndEmergency_MustBeIdempotentAndAccurate()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // Act - Run 1
        var run1 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.PatientIntakeContactsKey), CancellationToken.None);
        run1.Should().HaveCount(14);

        // Act - Run 2 & 3 (Idempotency)
        var run2 = await installHandler.Handle(new InstallCustomFieldTemplateCommand(ClinicCustomFieldTemplatesCatalog.PatientIntakeContactsKey), CancellationToken.None);
        run2.Should().HaveCount(14);
        var run3 = await installHandler.Handle(new InstallCustomFieldTemplateCommand("intake"), CancellationToken.None); // alias
        run3.Should().HaveCount(14);

        // Assert - Physical DB record count must remain exactly 14
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(14);

        // Verify Address Fields
        var primaryAddr = allInDb.First(f => f.FieldKey == "primary_address_line");
        primaryAddr.Label.Should().Be("Primary Address (House/Unit/Street)");
        primaryAddr.Category.Should().Be("Address");
        primaryAddr.IsRequired.Should().BeTrue();
        primaryAddr.DisplayOrder.Should().Be(1);

        var primaryCity = allInDb.First(f => f.FieldKey == "primary_city");
        primaryCity.Category.Should().Be("Address");
        primaryCity.IsRequired.Should().BeTrue();
        primaryCity.DisplayOrder.Should().Be(2);

        var secondaryAddr = allInDb.First(f => f.FieldKey == "secondary_address_line");
        secondaryAddr.Category.Should().Be("Address");
        secondaryAddr.IsRequired.Should().BeFalse();
        secondaryAddr.DisplayOrder.Should().Be(5);

        // Verify Emergency Contact Fields
        var emergencyName = allInDb.First(f => f.FieldKey == "emergency_contact_name");
        emergencyName.Category.Should().Be("Emergency Contacts");
        emergencyName.IsRequired.Should().BeTrue();
        emergencyName.DisplayOrder.Should().Be(7);

        var emergencyRel = allInDb.First(f => f.FieldKey == "emergency_contact_relationship");
        emergencyRel.Category.Should().Be("Emergency Contacts");
        emergencyRel.DataType.Should().Be(CustomFieldDataType.Select);
        emergencyRel.IsRequired.Should().BeTrue();
        emergencyRel.OptionsJson.Should().Contain("Parent");
        emergencyRel.OptionsJson.Should().Contain("Spouse");

        var emergencyPhone = allInDb.First(f => f.FieldKey == "emergency_contact_phone");
        emergencyPhone.Category.Should().Be("Emergency Contacts");
        emergencyPhone.IsRequired.Should().BeTrue();

        var emergencyAddr = allInDb.First(f => f.FieldKey == "emergency_contact_address");
        emergencyAddr.Category.Should().Be("Emergency Contacts");
        emergencyAddr.IsRequired.Should().BeFalse();

        var secEmergencyName = allInDb.First(f => f.FieldKey == "secondary_emergency_contact_name");
        secEmergencyName.Category.Should().Be("Emergency Contacts");
        secEmergencyName.IsRequired.Should().BeFalse();

        var secEmergencyAddr = allInDb.First(f => f.FieldKey == "secondary_emergency_contact_address");
        secEmergencyAddr.Category.Should().Be("Emergency Contacts");
        secEmergencyAddr.IsRequired.Should().BeFalse();

        // Verify Catalog aliases
        ClinicCustomFieldTemplatesCatalog.GetTemplate("intake").Should().NotBeNull();
        ClinicCustomFieldTemplatesCatalog.GetTemplate("patient_intake").Should().NotBeNull();
        ClinicCustomFieldTemplatesCatalog.GetTemplate("contacts").Should().NotBeNull();
        ClinicCustomFieldTemplatesCatalog.GetTemplate("address_emergency").Should().NotBeNull();
        ClinicCustomFieldTemplatesCatalog.GetTemplate("address").Should().NotBeNull();
        ClinicCustomFieldTemplatesCatalog.GetTemplate("emergency").Should().NotBeNull();

        // Verify Standalone presets
        var addrTemplate = ClinicCustomFieldTemplatesCatalog.GetTemplate(ClinicCustomFieldTemplatesCatalog.PatientIntakeAddressKey);
        addrTemplate.Should().NotBeNull();
        addrTemplate!.FieldCount.Should().Be(6);

        var emergTemplate = ClinicCustomFieldTemplatesCatalog.GetTemplate(ClinicCustomFieldTemplatesCatalog.PatientIntakeEmergencyKey);
        emergTemplate.Should().NotBeNull();
        emergTemplate!.FieldCount.Should().Be(8);
    }

    // =========================================================================
    // TASK 3: Validation of VisibilityRuleJson and ConditionalOptionsJson
    // =========================================================================

    [Theory]
    [InlineData("{not valid json")]
    [InlineData("[unclosed array")]
    [InlineData("random string without braces")]
    [InlineData("{\"key\": unquoted_value}")]
    [InlineData("{\"source\": \"custom_field\", \"field\": }")]
    public void Task3_1_CreateCustomField_InvalidVisibilityRuleJson_MustBeRejected(string invalidJson)
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "rule_test",
            Label: "Rule Test",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: invalidJson
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "VisibilityRuleJson" && e.ErrorMessage.Contains("valid JSON"));
    }

    [Theory]
    [InlineData("{not valid json")]
    [InlineData("{\"parentField\": broken")]
    [InlineData("unquoted")]
    public void Task3_2_CreateCustomField_InvalidConditionalOptionsJson_MustBeRejected(string invalidJson)
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "cond_test",
            Label: "Cond Test",
            DataType: CustomFieldDataType.Select,
            ConditionalOptionsJson: invalidJson
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ConditionalOptionsJson" && e.ErrorMessage.Contains("valid JSON"));
    }

    [Theory]
    [InlineData("{not valid json")]
    [InlineData("[unclosed")]
    public void Task3_3_CreateCustomField_InvalidOptionsJson_MustBeRejected(string invalidJson)
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "opts_test",
            Label: "Opts Test",
            DataType: CustomFieldDataType.Select,
            OptionsJson: invalidJson
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "OptionsJson" && e.ErrorMessage.Contains("valid JSON"));
    }

    [Theory]
    [InlineData("{bad json")]
    [InlineData("{\"field\": }")]
    public void Task3_4_UpdateCustomField_InvalidVisibilityAndConditionalJson_MustBeRejected(string invalidJson)
    {
        // Arrange
        var validator = new UpdateCustomFieldDefinitionCommandValidator();

        var badVisCommand = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Test",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: invalidJson
        );

        var badCondCommand = new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Test",
            DataType: CustomFieldDataType.Text,
            ConditionalOptionsJson: invalidJson
        );

        // Act & Assert
        var visResult = validator.Validate(badVisCommand);
        visResult.IsValid.Should().BeFalse();
        visResult.Errors.Should().Contain(e => e.PropertyName == "VisibilityRuleJson" && e.ErrorMessage.Contains("valid JSON"));

        var condResult = validator.Validate(badCondCommand);
        condResult.IsValid.Should().BeFalse();
        condResult.Errors.Should().Contain(e => e.PropertyName == "ConditionalOptionsJson" && e.ErrorMessage.Contains("valid JSON"));
    }

    [Fact]
    public void Task3_5_ValidJsonAndNull_MustPassValidation()
    {
        // Arrange
        var validator = new CreateCustomFieldDefinitionCommandValidator();
        var validVisJson = "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}";
        var validCondJson = "{\"parentField\":\"college\",\"mapping\":{\"Engineering\":[\"Civil\"]},\"defaultOptions\":[]}";
        var validOptsJson = "[\"Option A\",\"Option B\"]";

        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "valid_field",
            Label: "Valid Field",
            DataType: CustomFieldDataType.Select,
            OptionsJson: validOptsJson,
            VisibilityRuleJson: validVisJson,
            ConditionalOptionsJson: validCondJson
        );

        var nullCommand = new CreateCustomFieldDefinitionCommand(
            FieldKey: "null_field",
            Label: "Null Field",
            DataType: CustomFieldDataType.Text,
            OptionsJson: null,
            VisibilityRuleJson: null,
            ConditionalOptionsJson: null
        );

        var emptyCommand = new CreateCustomFieldDefinitionCommand(
            FieldKey: "empty_field",
            Label: "Empty Field",
            DataType: CustomFieldDataType.Text,
            OptionsJson: "",
            VisibilityRuleJson: "   ",
            ConditionalOptionsJson: ""
        );

        // Act & Assert
        validator.Validate(command).IsValid.Should().BeTrue();
        validator.Validate(nullCommand).IsValid.Should().BeTrue();
        validator.Validate(emptyCommand).IsValid.Should().BeTrue();
    }
}
