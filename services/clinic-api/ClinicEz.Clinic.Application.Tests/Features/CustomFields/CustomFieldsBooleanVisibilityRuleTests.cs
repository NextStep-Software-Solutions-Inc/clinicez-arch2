using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.Helpers;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.CustomFields;

public class CustomFieldsBooleanVisibilityRuleTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_bool_test_01";
    private readonly IClinicContext _clinicContext;

    public CustomFieldsBooleanVisibilityRuleTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private async Task<(ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext context, IUnitOfWork uow, IRepository<ClinicCustomFieldDefinition> repo)> CreateContextWithBooleanParentAsync(string parentKey = "is_pregnant")
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var parent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = parentKey,
            Label = "Is Pregnant",
            DataType = CustomFieldDataType.Boolean,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(parent, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        return (context, uow, repo);
    }

    // =========================================================================
    // 1. Valid Booleans Normalized (Primitives & Case-Insensitive Strings)
    // =========================================================================

    [Theory]
    [InlineData("true", "true")]
    [InlineData("false", "false")]
    [InlineData("\"true\"", "true")]
    [InlineData("\"false\"", "false")]
    [InlineData("\"True\"", "true")]
    [InlineData("\"False\"", "false")]
    [InlineData("\"TRUE\"", "true")]
    [InlineData("\"FALSE\"", "false")]
    [InlineData("\"yes\"", "true")]
    [InlineData("\"Yes\"", "true")]
    [InlineData("\"YES\"", "true")]
    [InlineData("\"no\"", "false")]
    [InlineData("\"No\"", "false")]
    [InlineData("\"NO\"", "false")]
    public async Task NormalizeAndValidateAsync_ValidBooleans_ShouldNormalizeToCanonicalString(string rawValue, string expectedCanonical)
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{rawValue}}}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("field").GetString().Should().Be("is_pregnant");
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be(expectedCanonical);
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_OperatorCanonicalization_ShouldLowercase()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"EQUALS\",\"value\":\"yes\"}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_NotEqualsOperator_ShouldCanonicalizeAndNormalize()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"NOT_EQUALS\",\"value\":false}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("not_equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("false");
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_NotEmptyOperator_ShouldSucceedWithoutValue()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"NOT_EMPTY\"}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("not_empty");
    }

    // =========================================================================
    // 2. Unsupported Operators Rejected
    // =========================================================================

    [Theory]
    [InlineData("in")]
    [InlineData("contains")]
    [InlineData("greater_than")]
    [InlineData("regex")]
    [InlineData("unknown_op")]
    public async Task NormalizeAndValidateAsync_UnsupportedOperator_ShouldThrowValidationException(string op)
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"{op}\",\"value\":\"true\"}}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage($"*Operator '{op}' is not supported for boolean parent fields*");
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_MissingOperator_ShouldThrowValidationException()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"value\":\"true\"}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*operator is required*");
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_EmptyOperator_ShouldThrowValidationException()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"   \",\"value\":\"true\"}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*operator*");
    }

    // =========================================================================
    // 3. Arbitrary & Invalid Values Rejected
    // =========================================================================

    [Theory]
    [InlineData("\"maybe\"")]
    [InlineData("\"foo\"")]
    [InlineData("\"123\"")]
    [InlineData("\"0\"")]
    [InlineData("\"1\"")]
    [InlineData("\"\"")]
    [InlineData("\"   \"")]
    [InlineData("1")]
    [InlineData("0")]
    [InlineData("123")]
    [InlineData("3.14")]
    [InlineData("[\"true\"]")]
    [InlineData("[]")]
    [InlineData("{\"nested\":\"true\"}")]
    public async Task NormalizeAndValidateAsync_ArbitraryOrInvalidValues_ShouldThrowValidationException(string rawValue)
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{rawValue}}}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_MissingValueProperty_ShouldThrowValidationException()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\"}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*value is required*");
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_NullValue_ShouldThrowValidationException()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("is_pregnant");
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":null}";

        // Act & Assert
        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
    }

    // =========================================================================
    // 4. Byte-for-Byte Preservation (Non-Boolean, Static, Non-Existent, Empty)
    // =========================================================================

    [Fact]
    public async Task NormalizeAndValidateAsync_NonBooleanParentField_Text_ShouldPreserveByteForByte()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var parent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "affiliation",
            Label = "Affiliation",
            DataType = CustomFieldDataType.Text,
            IsActive = true
        };
        await repo.AddAsync(parent, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        const string rawJson = "  {\r\n  \"source\": \"custom_field\",\r\n  \"field\": \"affiliation\",\r\n  \"operator\": \"contains\",\r\n  \"value\": \"Student\"\r\n}  ";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().Be(rawJson);
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_NonBooleanParentField_Select_ShouldPreserveByteForByte()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var parent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "college",
            Label = "College",
            DataType = CustomFieldDataType.Select,
            IsActive = true
        };
        await repo.AddAsync(parent, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        const string rawJson = "{\"source\":\"custom_field\",\"field\":\"college\",\"operator\":\"in\",\"value\":[\"Engineering\",\"Science\"]}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().Be(rawJson);
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_StaticSource_ShouldPreserveByteForByte()
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync("gender");
        const string rawJson = "{\"source\": \"static\", \"field\": \"gender\", \"operator\": \"contains\", \"value\": \"Female\"}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().Be(rawJson);
    }

    [Fact]
    public async Task NormalizeAndValidateAsync_NonExistentParentField_ShouldPreserveByteForByte()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        const string rawJson = "{\"source\":\"custom_field\",\"field\":\"non_existent_key\",\"operator\":\"in\",\"value\":\"foo\"}";

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().Be(rawJson);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task NormalizeAndValidateAsync_NullOrEmptyJson_ShouldReturnVerbatim(string? emptyJson)
    {
        // Arrange
        var (_, _, repo) = await CreateContextWithBooleanParentAsync();

        // Act
        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            emptyJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        // Assert
        result.Should().Be(emptyJson);
    }

    // =========================================================================
    // 5. Handlers Integration (Create & Update Commands)
    // =========================================================================

    [Fact]
    public async Task CreateCustomFieldDefinitionCommand_BooleanParent_ValidRule_ShouldNormalizeAndPersist()
    {
        // Arrange
        var (context, uow, repo) = await CreateContextWithBooleanParentAsync("has_allergies");
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "allergy_details",
            Label: "Allergy Details",
            DataType: CustomFieldDataType.Text,
            EntityType: "ClinicPatient",
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"has_allergies\",\"operator\":\"EQUALS\",\"value\":\"yes\"}");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.VisibilityRuleJson.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result.VisibilityRuleJson!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    [Fact]
    public async Task CreateCustomFieldDefinitionCommand_BooleanParent_ArbitraryValue_ShouldThrowValidationException()
    {
        // Arrange
        var (context, uow, repo) = await CreateContextWithBooleanParentAsync("has_allergies");
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "allergy_details",
            Label: "Allergy Details",
            DataType: CustomFieldDataType.Text,
            EntityType: "ClinicPatient",
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"has_allergies\",\"operator\":\"equals\",\"value\":\"maybe\"}");

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value 'maybe'*");
    }

    [Fact]
    public async Task CreateCustomFieldDefinitionCommand_BooleanParent_UnsupportedOperator_ShouldThrowValidationException()
    {
        // Arrange
        var (context, uow, repo) = await CreateContextWithBooleanParentAsync("has_allergies");
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var command = new CreateCustomFieldDefinitionCommand(
            FieldKey: "allergy_details",
            Label: "Allergy Details",
            DataType: CustomFieldDataType.Text,
            EntityType: "ClinicPatient",
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"has_allergies\",\"operator\":\"contains\",\"value\":\"true\"}");

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Operator 'contains' is not supported for boolean parent fields*");
    }

    [Fact]
    public async Task UpdateCustomFieldDefinitionCommand_BooleanParent_ValidRule_ShouldNormalizeAndPersist()
    {
        // Arrange
        var (context, uow, repo) = await CreateContextWithBooleanParentAsync("is_employed");
        var childField = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "company_name",
            Label = "Company Name",
            DataType = CustomFieldDataType.Text,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(childField, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: childField.Id,
            Label: "Company Name Updated",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"is_employed\",\"operator\":\"NOT_EQUALS\",\"value\":\"no\"}");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.VisibilityRuleJson.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result.VisibilityRuleJson!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("not_equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("false");
    }

    [Fact]
    public async Task UpdateCustomFieldDefinitionCommand_BooleanParent_ArbitraryValue_ShouldThrowValidationException()
    {
        // Arrange
        var (context, uow, repo) = await CreateContextWithBooleanParentAsync("is_employed");
        var childField = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "company_name",
            Label = "Company Name",
            DataType = CustomFieldDataType.Text,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(childField, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: childField.Id,
            Label: "Company Name Updated",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"is_employed\",\"operator\":\"equals\",\"value\":123}");

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*cannot be a number*");
    }

    [Fact]
    public async Task UpdateCustomFieldDefinitionCommand_NonBooleanParent_ShouldPreserveByteForByte()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var textParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "role_type",
            Label = "Role Type",
            DataType = CustomFieldDataType.Text,
            IsActive = true
        };
        await repo.AddAsync(textParent, CancellationToken.None);

        var childField = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "badge_number",
            Label = "Badge Number",
            DataType = CustomFieldDataType.Text,
            IsActive = true
        };
        await repo.AddAsync(childField, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        const string rawJson = "{\"source\": \"custom_field\", \"field\": \"role_type\", \"operator\": \"contains\", \"value\": \"Manager\"}";

        var handler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var command = new UpdateCustomFieldDefinitionCommand(
            Id: childField.Id,
            Label: "Badge Number",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: rawJson);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.VisibilityRuleJson.Should().Be(rawJson);
    }
}
