using System;
using System.Collections.Generic;
using System.Linq;
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

public class Issue82BackendAdversarialChallengerTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_issue82";
    private readonly IClinicContext _clinicContext;

    public Issue82BackendAdversarialChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private async Task<(ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext context, IUnitOfWork uow, IRepository<ClinicCustomFieldDefinition> repo)> CreateContextWithParentsAsync()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        // Boolean parent
        var boolParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "is_pregnant",
            Label = "Is Pregnant",
            DataType = CustomFieldDataType.Boolean,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(boolParent, CancellationToken.None);

        // Text parent
        var textParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "text_parent",
            Label = "Text Parent",
            DataType = CustomFieldDataType.Text,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(textParent, CancellationToken.None);

        // Number parent
        var numberParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "number_parent",
            Label = "Number Parent",
            DataType = CustomFieldDataType.Number,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(numberParent, CancellationToken.None);

        // Select parent
        var selectParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "select_parent",
            Label = "Select Parent",
            DataType = CustomFieldDataType.Select,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(selectParent, CancellationToken.None);

        // Date parent
        var dateParent = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "date_parent",
            Label = "Date Parent",
            DataType = CustomFieldDataType.Date,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(dateParent, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        return (context, uow, repo);
    }

    // =========================================================================
    // 1. Extreme Payloads & Attack Vectors
    // =========================================================================

    [Fact]
    public async Task ExtremePayloads_DeeplyNestedValueObject_ShouldThrowValidationException()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{\"nested\":{\"level2\":{\"level3\":true}}}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*cannot be an array or object*");
    }

    [Fact]
    public async Task ExtremePayloads_HugeStringValue_ShouldThrowValidationException()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var hugeString = new string('A', 50000);
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"{hugeString}\"}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value*");
    }

    [Fact]
    public async Task ExtremePayloads_HugeFieldKey_NonMatching_ShouldPreserveByteForByte()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var hugeKey = new string('x', 2000);
        var json = $"{{\"source\":\"custom_field\",\"field\":\"{hugeKey}\",\"operator\":\"in\",\"value\":[\"test\"]}}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(json);
    }

    [Theory]
    [InlineData("👍")]
    [InlineData("✅")]
    [InlineData("❌")]
    [InlineData("😀")]
    [InlineData("نعم")]
    [InlineData("是")]
    [InlineData("True\u200B")] // zero-width space (non-standard whitespace)
    [InlineData("true\\u0000")] // valid JSON unicode escape for null character
    [InlineData("true😊")]
    [InlineData("yes👍")]
    [InlineData("no❌")]
    public async Task ExtremePayloads_UnicodeAndEmojiInBooleanValue_ShouldThrowValidationException(string emojiVal)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"{emojiVal}\"}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value*");
    }

    [Fact]
    public async Task ExtremePayloads_NonBreakingSpaceInValue_ShouldTrimAndCanonicalize()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        // In .NET, \u00A0 is recognized as Unicode whitespace and trimmed by string.Trim()
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"true\u00A0\"}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    [Theory]
    [InlineData("' OR '1'='1")]
    [InlineData("'; DROP TABLE ClinicCustomFieldDefinitions; --")]
    [InlineData("1; SELECT * FROM users;")]
    [InlineData("UNION SELECT null, null, null--")]
    public async Task ExtremePayloads_SqlInjectionInRuleValue_ShouldThrowValidationException(string sqlInjection)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"{sqlInjection}\"}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value*");
    }

    [Fact]
    public async Task ExtremePayloads_SqlInjectionInFieldKey_ShouldReturnVerbatimSafely()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        const string injectionKey = "' OR '1'='1; --";
        var json = $"{{\"source\":\"custom_field\",\"field\":\"{injectionKey}\",\"operator\":\"equals\",\"value\":\"true\"}}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(json);
    }

    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("<img src=x onerror=alert(1)>")]
    [InlineData("javascript:alert(1)")]
    public async Task ExtremePayloads_XssPayloadInValue_ShouldThrowValidationException(string xss)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"{xss}\"}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value*");
    }

    [Fact]
    public async Task ExtremePayloads_WhitespacePaddedBooleans_ShouldTrimAndCanonicalize()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"  true  \"}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    [Fact]
    public async Task ExtremePayloads_TabNewlinePaddedYes_ShouldTrimAndCanonicalize()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"\\t\\nYes\\r\\n\"}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    // =========================================================================
    // 2. Malformed JSON & Non-Object Payloads
    // =========================================================================

    [Theory]
    [InlineData("not json at all")]
    [InlineData("{")]
    [InlineData("{\"field\": \"is_pregnant\", \"operator\":")]
    [InlineData("{\"unclosed\": \"quotes}")]
    public async Task MalformedJson_InvalidJsonStrings_ShouldReturnVerbatimWithoutUnhandledCrash(string invalidJson)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            invalidJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(invalidJson);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("[\"is_pregnant\", \"equals\", \"true\"]")]
    [InlineData("\"just a plain string\"")]
    [InlineData("123.456")]
    [InlineData("true")]
    [InlineData("false")]
    [InlineData("null")]
    public async Task NonObjectJson_PrimitivesAndArrays_ShouldReturnVerbatimWithoutCrash(string nonObjectJson)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            nonObjectJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(nonObjectJson);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"source\":\"custom_field\"}")]
    [InlineData("{\"other\":\"property\"}")]
    public async Task MissingFieldKey_ShouldReturnVerbatim(string emptyOrFieldlessObj)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            emptyOrFieldlessObj,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(emptyOrFieldlessObj);
    }

    [Theory]
    [InlineData("{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":null,\"value\":true}")]
    [InlineData("{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":123,\"value\":true}")]
    [InlineData("{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":true,\"value\":true}")]
    [InlineData("{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":[\"equals\"],\"value\":true}")]
    [InlineData("{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":{\"op\":\"equals\"},\"value\":true}")]
    public async Task InvalidOperatorType_NonStringOperators_ShouldThrowValidationException(string json)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*operator is required*");
    }

    // =========================================================================
    // 3. Comprehensive Unsupported Operator Fuzzing
    // =========================================================================

    [Theory]
    [InlineData("in")]
    [InlineData("contains")]
    [InlineData("regex")]
    [InlineData("like")]
    [InlineData("startsWith")]
    [InlineData("endsWith")]
    [InlineData("greater_than")]
    [InlineData("less_than")]
    [InlineData("gt")]
    [InlineData("gte")]
    [InlineData("lt")]
    [InlineData("lte")]
    [InlineData("==")]
    [InlineData("!=")]
    [InlineData("<>")]
    [InlineData("between")]
    [InlineData("matches")]
    public async Task UnsupportedOperators_ShouldAllThrowValidationException(string op)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"{op}\",\"value\":\"true\"}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage($"*Operator '{op}' is not supported for boolean parent fields*");
    }

    // =========================================================================
    // 4. Values for equals / not_equals Fuzzing
    // =========================================================================

    [Theory]
    [InlineData("0")]
    [InlineData("1")]
    [InlineData("-1")]
    [InlineData("123")]
    [InlineData("3.14")]
    [InlineData("0.0")]
    [InlineData("-0")]
    [InlineData("1e5")]
    public async Task InvalidValues_NumericPrimitives_ShouldThrowValidationException(string numVal)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{numVal}}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*cannot be a number*");
    }

    [Theory]
    [InlineData("\"0\"")]
    [InlineData("\"1\"")]
    [InlineData("\"-1\"")]
    [InlineData("\"123\"")]
    [InlineData("\"3.14\"")]
    [InlineData("\"maybe\"")]
    [InlineData("\"unknown\"")]
    [InlineData("\"null\"")]
    [InlineData("\"undefined\"")]
    [InlineData("\"t\"")]
    [InlineData("\"f\"")]
    [InlineData("\"y\"")]
    [InlineData("\"n\"")]
    [InlineData("\"TRUE_OR_FALSE\"")]
    [InlineData("\"yes please\"")]
    [InlineData("\"no thanks\"")]
    public async Task InvalidValues_ArbitraryStrings_ShouldThrowValidationException(string strVal)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{strVal}}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid boolean value*");
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("[\"true\"]")]
    [InlineData("[\"false\"]")]
    [InlineData("[true]")]
    [InlineData("[1]")]
    [InlineData("[\"yes\"]")]
    public async Task InvalidValues_Arrays_ShouldThrowValidationException(string arrVal)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{arrVal}}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*cannot be an array or object*");
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"val\": true}")]
    [InlineData("{\"bool\": \"true\"}")]
    public async Task InvalidValues_Objects_ShouldThrowValidationException(string objVal)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{objVal}}}";

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*cannot be an array or object*");
    }

    // =========================================================================
    // 5. Casing & Property Name Canonicalization
    // =========================================================================

    [Theory]
    [InlineData("\"True\"", "true")]
    [InlineData("\"TRUE\"", "true")]
    [InlineData("\"tRuE\"", "true")]
    [InlineData("\"Yes\"", "true")]
    [InlineData("\"YES\"", "true")]
    [InlineData("\"yEs\"", "true")]
    [InlineData("\"False\"", "false")]
    [InlineData("\"FALSE\"", "false")]
    [InlineData("\"FaLsE\"", "false")]
    [InlineData("\"No\"", "false")]
    [InlineData("\"NO\"", "false")]
    [InlineData("\"nO\"", "false")]
    public async Task CasingVariations_ShouldCanonicalizeToTrueOrFalse(string rawVal, string expected)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":{rawVal}}}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("value").GetString().Should().Be(expected);
    }

    [Fact]
    public async Task CasingVariations_UppercasePropertyNames_ShouldNormalizeKeyNames()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        const string json = "{\"SOURCE\":\"CUSTOM_FIELD\",\"FIELD\":\"IS_PREGNANT\",\"OPERATOR\":\"EQUALS\",\"VALUE\":\"YES\"}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
        // Ensure old uppercase properties were removed and replaced
        doc.RootElement.TryGetProperty("OPERATOR", out _).Should().BeFalse();
        doc.RootElement.TryGetProperty("VALUE", out _).Should().BeFalse();
    }

    [Fact]
    public async Task PropertyName_FieldKeyAlias_ShouldBeRecognizedAndValidated()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        const string json = "{\"source\":\"custom_field\",\"fieldKey\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"false\"}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("false");
    }

    [Theory]
    [InlineData("is_pregnant")]
    [InlineData("IS_PREGNANT")]
    [InlineData("is pregnant")]
    [InlineData("  is_pregnant  ")]
    public async Task FieldKeyNormalization_DifferentCasingAndSpacing_ShouldMatchBooleanParent(string key)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var json = $"{{\"source\":\"custom_field\",\"field\":\"{key}\",\"operator\":\"EQUALS\",\"value\":\"true\"}}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            json,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
    }

    // =========================================================================
    // 6. Non-Boolean Parent Field Preservation
    // =========================================================================

    [Theory]
    [InlineData("text_parent", "contains", "\"Student\"")]
    [InlineData("number_parent", "greater_than", "18")]
    [InlineData("select_parent", "in", "[\"DeptA\", \"DeptB\"]")]
    [InlineData("date_parent", "less_than", "\"2026-01-01\"")]
    public async Task NonBooleanParents_ShouldPreserveRuleJsonByteForByte(string fieldKey, string op, string val)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var rawJson = $"  {{\r\n    \"source\": \"custom_field\",\r\n    \"field\": \"{fieldKey}\",\r\n    \"operator\": \"{op}\",\r\n    \"value\": {val}\r\n  }}  ";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(rawJson);
    }

    // =========================================================================
    // 7. Static Source Rules Preservation
    // =========================================================================

    [Theory]
    [InlineData("static")]
    [InlineData("STATIC")]
    [InlineData("Static")]
    [InlineData(" static ")]
    public async Task StaticSource_EvenWithBooleanFieldName_ShouldPreserveByteForByte(string sourceStr)
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        var rawJson = $"  {{\"source\": \"{sourceStr}\", \"field\": \"is_pregnant\", \"operator\": \"contains\", \"value\": \"anything\"}}  ";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().Be(rawJson);
    }

    // =========================================================================
    // 8. Extra Properties Preservation
    // =========================================================================

    [Fact]
    public async Task ExtraProperties_InBooleanRule_ShouldRetainExtraFieldsWhenNormalized()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        const string rawJson = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"EQUALS\",\"value\":\"YES\",\"extraTag\":\"keep_me\",\"priority\":99}";

        var result = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            rawJson,
            "ClinicPatient",
            repo,
            CancellationToken.None);

        result.Should().NotBeNull();
        using var doc = JsonDocument.Parse(result!);
        doc.RootElement.GetProperty("operator").GetString().Should().Be("equals");
        doc.RootElement.GetProperty("value").GetString().Should().Be("true");
        doc.RootElement.GetProperty("extraTag").GetString().Should().Be("keep_me");
        doc.RootElement.GetProperty("priority").GetInt32().Should().Be(99);
    }

    // =========================================================================
    // 9. Concurrency & CancellationToken Handling
    // =========================================================================

    [Fact]
    public async Task Concurrency_CancellationTokenCancelled_ShouldThrowOperationCanceledException()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(
            "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":true}",
            "ClinicPatient",
            repo,
            cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task Concurrency_100ParallelTasks_ShouldExecuteSafelyWithoutCrossTaskCorruption()
    {
        var (_, _, repo) = await CreateContextWithParentsAsync();

        var tasks = Enumerable.Range(0, 100).Select(async i =>
        {
            if (i % 4 == 0)
            {
                // Valid true
                var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"EQUALS\",\"value\":\"yes\"}";
                var res = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(json, "ClinicPatient", repo, CancellationToken.None);
                using var d = JsonDocument.Parse(res!);
                d.RootElement.GetProperty("value").GetString().Should().Be("true");
            }
            else if (i % 4 == 1)
            {
                // Valid false
                var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"NOT_EQUALS\",\"value\":\"NO\"}";
                var res = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(json, "ClinicPatient", repo, CancellationToken.None);
                using var d = JsonDocument.Parse(res!);
                d.RootElement.GetProperty("value").GetString().Should().Be("false");
            }
            else if (i % 4 == 2)
            {
                // Non-boolean parent (byte-for-byte)
                var json = "{\"source\":\"custom_field\",\"field\":\"text_parent\",\"operator\":\"contains\",\"value\":\"ABC\"}";
                var res = await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(json, "ClinicPatient", repo, CancellationToken.None);
                res.Should().Be(json);
            }
            else
            {
                // Invalid operator -> throws
                var json = "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"in\",\"value\":[\"true\"]}";
                var act = async () => await CustomFieldVisibilityRuleNormalizer.NormalizeAndValidateAsync(json, "ClinicPatient", repo, CancellationToken.None);
                await act.Should().ThrowAsync<ValidationException>();
            }
        });

        await Task.WhenAll(tasks);
    }

    // =========================================================================
    // 10. MediatR Command Handlers Integration Stress Testing
    // =========================================================================

    [Fact]
    public async Task CreateCommandHandler_WhenRuleHasEmojiBoolean_ShouldRejectWithValidationException()
    {
        var (context, uow, repo) = await CreateContextWithParentsAsync();
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var cmd = new CreateCustomFieldDefinitionCommand(
            FieldKey: "child_field_emoji",
            Label: "Child Field",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"👍\"}");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task CreateCommandHandler_WhenRuleHasArrayValue_ShouldRejectWithValidationException()
    {
        var (context, uow, repo) = await CreateContextWithParentsAsync();
        var handler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var cmd = new CreateCustomFieldDefinitionCommand(
            FieldKey: "child_field_arr",
            Label: "Child Field",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":[\"true\"]}");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task UpdateCommandHandler_WhenRuleHasSqlInjection_ShouldRejectWithValidationException()
    {
        var (context, uow, repo) = await CreateContextWithParentsAsync();
        var existing = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "child_update",
            Label = "Child",
            DataType = CustomFieldDataType.Text,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var cmd = new UpdateCustomFieldDefinitionCommand(
            Id: existing.Id,
            Label: "Child Updated",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"is_pregnant\",\"operator\":\"equals\",\"value\":\"' OR '1'='1\"}");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task UpdateCommandHandler_WhenStaticRuleProvided_ShouldPreserveRuleExactByteForByte()
    {
        var (context, uow, repo) = await CreateContextWithParentsAsync();
        var existing = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "child_static",
            Label = "Child",
            DataType = CustomFieldDataType.Text,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        const string staticRule = "  {\r\n  \"source\": \"static\",\r\n  \"field\": \"civil_status\",\r\n  \"operator\": \"equals\",\r\n  \"value\": \"Married\"\r\n}  ";

        var handler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var cmd = new UpdateCustomFieldDefinitionCommand(
            Id: existing.Id,
            Label: "Child Updated",
            DataType: CustomFieldDataType.Text,
            VisibilityRuleJson: staticRule);

        var result = await handler.Handle(cmd, CancellationToken.None);
        result.VisibilityRuleJson.Should().Be(staticRule);
    }
}
