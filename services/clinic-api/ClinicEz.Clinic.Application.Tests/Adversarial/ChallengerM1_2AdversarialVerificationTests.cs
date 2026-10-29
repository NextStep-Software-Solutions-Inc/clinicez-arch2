using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite by Challenger M1_2.
/// Verifies:
/// 1. Dynamic metadata persistence in Patient.CustomFields dictionary with edge-case values
///    (empty strings, numbers, booleans, special unicode characters, nested structures, nulls).
/// 2. Multi-tenant isolation: Tenant A cannot access, modify, reorder, or delete custom field definitions belonging to Tenant B.
/// </summary>
public class ChallengerM1_2AdversarialVerificationTests
{
    private static (ApplicationDbContext ContextA, IUnitOfWork UowA, Repository<T> RepoA,
                   ApplicationDbContext ContextB, IUnitOfWork UowB, Repository<T> RepoB,
                   ApplicationDbContext ContextAdmin)
        CreateSharedDatabasePair<T>(IClinicContext contextA, IClinicContext contextB) where T : ClinicEz.Clinic.Domain.Common.BaseEntity
    {
        var dbName = $"ClinicEz_SharedTestDb_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var adminContext = Substitute.For<IClinicContext>();
        adminContext.TenantId.Returns("admin_tenant");
        adminContext.ClinicId.Returns(Guid.Empty);

        var dbA = new ApplicationDbContext(options, config, contextA);
        var dbB = new ApplicationDbContext(options, config, contextB);
        var dbAdmin = new ApplicationDbContext(options, config, adminContext);

        var sieveA = Substitute.For<ISieveProcessor>();
        var sieveB = Substitute.For<ISieveProcessor>();
        var prodA = Substitute.For<IProductRepository>();
        var prodB = Substitute.For<IProductRepository>();

        var uowA = new UnitOfWork(dbA, sieveA, prodA);
        var uowB = new UnitOfWork(dbB, sieveB, prodB);

        var repoA = new Repository<T>(dbA, sieveA);
        var repoB = new Repository<T>(dbB, sieveB);

        return (dbA, uowA, repoA, dbB, uowB, repoB, dbAdmin);
    }

    private static RegisterClinicPatientCommand CreateRegisterCommand(string firstName, string lastName, Dictionary<string, object?> customFields) =>
        new(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 5, 20),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0917-111-2222",
            Email: $"{firstName.ToLower()}@example.com",
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
            CustomFields: customFields
        );

    private static UpdateClinicPatientCommand CreateUpdateCommand(Guid id, string firstName, string lastName, Dictionary<string, object?> customFields) =>
        new(
            Id: id,
            FirstName: firstName,
            LastName: lastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 5, 20),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0917-111-2222",
            Email: $"{firstName.ToLower()}@example.com",
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
            CustomFields: customFields
        );

    // =========================================================================
    // TASK 1: DYNAMIC METADATA PERSISTENCE IN Patient.CustomFields
    // =========================================================================

    [Fact]
    public async Task CustomFields_Persistence_EmptyAndWhitespaceStrings_ShouldPersistAndRoundtripCleanly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_edge_case");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var edgeFields = new Dictionary<string, object?>
        {
            ["empty_str"] = "",
            ["spaces_only"] = "   ",
            ["newline_only"] = "\n",
            ["tab_only"] = "\t"
        };

        var command = CreateRegisterCommand("Maria", "Santos", edgeFields);

        // Act
        var created = await registerHandler.Handle(command, CancellationToken.None);

        // Force true database reload by clearing EF Core change tracker
        context.ChangeTracker.Clear();

        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields.Should().ContainKey("empty_str");
        reloaded.CustomFields["empty_str"]!.ToString().Should().Be("");

        reloaded.CustomFields.Should().ContainKey("spaces_only");
        reloaded.CustomFields["spaces_only"]!.ToString().Should().Be("   ");

        reloaded.CustomFields.Should().ContainKey("newline_only");
        reloaded.CustomFields["newline_only"]!.ToString().Should().Be("\n");

        reloaded.CustomFields.Should().ContainKey("tab_only");
        reloaded.CustomFields["tab_only"]!.ToString().Should().Be("\t");
    }

    [Fact]
    public async Task CustomFields_Persistence_NumericEdgeCases_ShouldPersistExactValues()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_edge_numbers");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var edgeNumbers = new Dictionary<string, object?>
        {
            ["zero_int"] = 0,
            ["positive_int"] = 42,
            ["negative_int"] = -98765,
            ["max_int"] = int.MaxValue,
            ["min_int"] = int.MinValue,
            ["large_long"] = 9223372036854775800L,
            ["pi_double"] = 3.141592653589793,
            ["negative_decimal"] = -45.6789
        };

        var command = CreateRegisterCommand("Jose", "Rizal", edgeNumbers);

        // Act
        var created = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert - when deserialized via System.Text.Json object?, numbers are JsonElement
        reloaded.CustomFields.Should().NotBeNull();

        // 0
        var zeroVal = reloaded.CustomFields["zero_int"];
        zeroVal.Should().NotBeNull();
        Convert.ToInt32(zeroVal!.ToString()).Should().Be(0);

        // Positive Int
        Convert.ToInt32(reloaded.CustomFields["positive_int"]!.ToString()).Should().Be(42);

        // Negative Int
        Convert.ToInt32(reloaded.CustomFields["negative_int"]!.ToString()).Should().Be(-98765);

        // Max Int
        Convert.ToInt32(reloaded.CustomFields["max_int"]!.ToString()).Should().Be(int.MaxValue);

        // Min Int
        Convert.ToInt32(reloaded.CustomFields["min_int"]!.ToString()).Should().Be(int.MinValue);

        // Large Long
        Convert.ToInt64(reloaded.CustomFields["large_long"]!.ToString()).Should().Be(9223372036854775800L);

        // Double
        Convert.ToDouble(reloaded.CustomFields["pi_double"]!.ToString()).Should().BeApproximately(3.141592653589793, 0.0000000001);

        // Negative Decimal
        Convert.ToDouble(reloaded.CustomFields["negative_decimal"]!.ToString()).Should().BeApproximately(-45.6789, 0.0001);
    }

    [Fact]
    public async Task CustomFields_Persistence_BooleansAndNulls_ShouldPersistExactSemantics()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_edge_bools");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var boolFields = new Dictionary<string, object?>
        {
            ["is_active"] = true,
            ["is_scholar"] = false,
            ["has_disability"] = true,
            ["optional_flag"] = null
        };

        var command = CreateRegisterCommand("Andres", "Bonifacio", boolFields);

        // Act
        var created = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert
        reloaded.CustomFields.Should().NotBeNull();

        // True
        var active = reloaded.CustomFields["is_active"];
        Convert.ToBoolean(active!.ToString()).Should().BeTrue();

        // False
        var scholar = reloaded.CustomFields["is_scholar"];
        Convert.ToBoolean(scholar!.ToString()).Should().BeFalse();

        // Null value preserved as key with null or missing
        reloaded.CustomFields.Should().ContainKey("optional_flag");
        reloaded.CustomFields["optional_flag"].Should().BeNull();
    }

    [Fact]
    public async Task CustomFields_Persistence_SpecialUnicodeCharactersAndScripts_ShouldPersistWithoutCorruption()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_edge_unicode");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var unicodeFields = new Dictionary<string, object?>
        {
            ["baybayin"] = "ᜊᜌ᜔ᜊᜌᜒᜈ᜔",
            ["filipino_diacritics"] = "Señorita Peña-Ñandú",
            ["emojis"] = "🩺💉🏥🚀👨‍⚕️🇵🇭✨",
            ["cjk"] = "日本語テスト・繁體中文測試・한국어 테스트",
            ["arabic_rtl"] = "مرحبا بالعالم - طبيب سريري",
            ["hebrew_rtl"] = "שלום עולם - מרפאה",
            ["math_greek"] = "α + β = γ | ∑(x_i) ≥ 100 Ω",
            ["escaped_symbols"] = "\"Quotes\" and \\Backslash\\ and /Slash/ and {Curly} and [Square] <Angle>"
        };

        var command = CreateRegisterCommand("Gabriela", "Silang", unicodeFields);

        // Act
        var created = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert - all scripts must roundtrip identically
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields["baybayin"]!.ToString().Should().Be("ᜊᜌ᜔ᜊᜌᜒᜈ᜔");
        reloaded.CustomFields["filipino_diacritics"]!.ToString().Should().Be("Señorita Peña-Ñandú");
        reloaded.CustomFields["emojis"]!.ToString().Should().Be("🩺💉🏥🚀👨‍⚕️🇵🇭✨");
        reloaded.CustomFields["cjk"]!.ToString().Should().Be("日本語テスト・繁體中文測試・한국어 테스트");
        reloaded.CustomFields["arabic_rtl"]!.ToString().Should().Be("مرحبا بالعالم - طبيب سريري");
        reloaded.CustomFields["hebrew_rtl"]!.ToString().Should().Be("שלום עולם - מרפאה");
        reloaded.CustomFields["math_greek"]!.ToString().Should().Be("α + β = γ | ∑(x_i) ≥ 100 Ω");
        reloaded.CustomFields["escaped_symbols"]!.ToString().Should().Be("\"Quotes\" and \\Backslash\\ and /Slash/ and {Curly} and [Square] <Angle>");
    }

    [Fact]
    public async Task CustomFields_Persistence_NestedStructures_ShouldPersistAndDeserializeStructure()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_edge_nested");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var nestedDict = new Dictionary<string, object?>
        {
            ["department"] = "IT Support",
            ["role_level"] = 3,
            ["is_supervisor"] = true,
            ["certifications"] = new List<string> { "CISSP", "PMP", "ITIL" }
        };

        var nestedList = new List<object>
        {
            "Allergy Alert",
            100,
            false,
            new Dictionary<string, string> { ["badge"] = "VIP" }
        };

        var nestedCustomFields = new Dictionary<string, object?>
        {
            ["employment_metadata"] = nestedDict,
            ["audit_tags"] = nestedList
        };

        var command = CreateRegisterCommand("Apolinario", "Mabini", nestedCustomFields);

        // Act
        var created = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert - verify nested structures serialize to JSON element and maintain internal fields
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields.Should().ContainKey("employment_metadata");
        reloaded.CustomFields.Should().ContainKey("audit_tags");

        var metaElement = (JsonElement)reloaded.CustomFields["employment_metadata"]!;
        metaElement.ValueKind.Should().Be(JsonValueKind.Object);
        metaElement.GetProperty("department").GetString().Should().Be("IT Support");
        metaElement.GetProperty("role_level").GetInt32().Should().Be(3);
        metaElement.GetProperty("is_supervisor").GetBoolean().Should().BeTrue();

        var certs = metaElement.GetProperty("certifications");
        certs.ValueKind.Should().Be(JsonValueKind.Array);
        certs.GetArrayLength().Should().Be(3);
        certs[0].GetString().Should().Be("CISSP");
        certs[1].GetString().Should().Be("PMP");
        certs[2].GetString().Should().Be("ITIL");

        var tagsElement = (JsonElement)reloaded.CustomFields["audit_tags"]!;
        tagsElement.ValueKind.Should().Be(JsonValueKind.Array);
        tagsElement.GetArrayLength().Should().Be(4);
        tagsElement[0].GetString().Should().Be("Allergy Alert");
        tagsElement[1].GetInt32().Should().Be(100);
        tagsElement[2].GetBoolean().Should().BeFalse();
        tagsElement[3].GetProperty("badge").GetString().Should().Be("VIP");
    }

    [Fact]
    public async Task CustomFields_UpdateCommand_ShouldMutateAndPersistNewMetadataAccurately()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_update_patient");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);
        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow);
        var getByIdHandler = new GetClinicPatientByIdQueryHandler(patientRepo);

        var initialFields = new Dictionary<string, object?>
        {
            ["student_id"] = "2024-00001",
            ["year_level"] = "1st Year"
        };

        var regCommand = CreateRegisterCommand("Melchora", "Aquino", initialFields);
        var patient = await registerHandler.Handle(regCommand, CancellationToken.None);

        // Act - Update with modified student_id, promoted year_level, and new scholarship boolean
        var updatedFields = new Dictionary<string, object?>
        {
            ["student_id"] = "2024-00001",
            ["year_level"] = "2nd Year",
            ["has_scholarship"] = true,
            ["gpa"] = 1.25
        };

        var updateCommand = CreateUpdateCommand(patient.Id, "Melchora", "Aquino", updatedFields);

        await updateHandler.Handle(updateCommand, CancellationToken.None);

        // Clear tracker & query back via GetClinicPatientByIdQuery
        context.ChangeTracker.Clear();
        var reloadedDto = await getByIdHandler.Handle(new GetClinicPatientByIdQuery(patient.Id), CancellationToken.None);

        // Assert
        reloadedDto.Should().NotBeNull();
        reloadedDto!.CustomFields.Should().NotBeNull();
        reloadedDto.CustomFields!["year_level"]!.ToString().Should().Be("2nd Year");
        reloadedDto.CustomFields["has_scholarship"]!.ToString().Should().Be("True");
        Convert.ToDouble(reloadedDto.CustomFields["gpa"]!.ToString()).Should().BeApproximately(1.25, 0.01);
    }

    // =========================================================================
    // TASK 2: MULTI-TENANT ISOLATION EMPIRICAL TESTS
    // =========================================================================

    [Fact]
    public async Task MultiTenant_QueryIsolation_TenantACannotSeeTenantBCustomFields()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, _) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerA = new CreateCustomFieldDefinitionCommandHandler(repoA, uowA, contextA);
        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);
        var queryHandlerA = new GetClinicCustomFieldsQueryHandler(repoA);
        var queryHandlerB = new GetClinicCustomFieldsQueryHandler(repoB);

        // Act - Tenant A creates 2 fields; Tenant B creates 3 fields
        var a1 = await createHandlerA.Handle(new CreateCustomFieldDefinitionCommand("a_id", "A ID", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var a2 = await createHandlerA.Handle(new CreateCustomFieldDefinitionCommand("a_dept", "A Dept", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);

        var b1 = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_secret", "B Secret", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var b2 = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_salary", "B Salary", CustomFieldDataType.Number, DisplayOrder: 2), CancellationToken.None);
        var b3 = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_pin", "B Security PIN", CustomFieldDataType.Text, DisplayOrder: 3), CancellationToken.None);

        // Clear trackers
        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act - Query as Tenant A and as Tenant B
        var listA = await queryHandlerA.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);
        var listB = await queryHandlerB.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);

        // Assert - Tenant A only sees Tenant A's fields
        listA.Should().HaveCount(2);
        listA.Select(f => f.FieldKey).Should().BeEquivalentTo(new[] { "a_id", "a_dept" });
        listA.Should().NotContain(f => f.FieldKey.StartsWith("b_"));

        // Assert - Tenant B only sees Tenant B's fields
        listB.Should().HaveCount(3);
        listB.Select(f => f.FieldKey).Should().BeEquivalentTo(new[] { "b_secret", "b_salary", "b_pin" });
        listB.Should().NotContain(f => f.FieldKey.StartsWith("a_"));
    }

    [Fact]
    public async Task MultiTenant_DirectAccessById_TenantACannotQueryTenantBFieldById()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, _, repoA, dbB, uowB, repoB, _) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);

        // Tenant B creates field
        var bField = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_confidential", "Confidential", CustomFieldDataType.Text), CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act - Tenant A attempts to find Tenant B's field by ID in its repository
        var foundByA = await repoA.Query().FirstOrDefaultAsync(f => f.Id == bField.Id);

        // Assert - Must be null due to global query filter
        foundByA.Should().BeNull();
    }

    [Fact]
    public async Task MultiTenant_ModifyIsolation_TenantACannotUpdateTenantBCustomField()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, dbAdmin) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);
        var updateHandlerA = new UpdateCustomFieldDefinitionCommandHandler(repoA, uowA);

        // Tenant B creates a custom field
        var bField = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "b_department",
            Label: "Tenant B Department",
            DataType: CustomFieldDataType.Text,
            IsRequired: false,
            DisplayOrder: 1), CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act - Tenant A attempts to maliciously update Tenant B's field
        var maliciousCommand = new UpdateCustomFieldDefinitionCommand(
            Id: bField.Id,
            Label: "Hacked by Tenant A",
            DataType: CustomFieldDataType.Number,
            IsRequired: true,
            DisplayOrder: 99
        );

        var act = () => updateHandlerA.Handle(maliciousCommand, CancellationToken.None);

        // Assert - Handler throws NotFoundException because field is outside Tenant A's tenant filter
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{bField.Id}*");

        // Verify in DB that Tenant B's field was NOT altered in any way
        dbAdmin.ChangeTracker.Clear();
        var verifiedBField = await dbAdmin.Set<CustomFieldDefinition>()
            .IgnoreQueryFilters()
            .FirstAsync(f => f.Id == bField.Id);

        verifiedBField.Label.Should().Be("Tenant B Department");
        verifiedBField.DataType.Should().Be(CustomFieldDataType.Text);
        verifiedBField.IsRequired.Should().BeFalse();
        verifiedBField.DisplayOrder.Should().Be(1);
        verifiedBField.TenantId.Should().Be("tenant_B");
        verifiedBField.ClinicId.Should().Be(clinicIdB);
    }

    [Fact]
    public async Task MultiTenant_ReorderIsolation_TenantACannotReorderOrMutateTenantBCustomFields()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, dbAdmin) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerA = new CreateCustomFieldDefinitionCommandHandler(repoA, uowA, contextA);
        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);
        var reorderHandlerA = new ReorderCustomFieldsCommandHandler(repoA, uowA, contextA);

        var a1 = await createHandlerA.Handle(new CreateCustomFieldDefinitionCommand("a_first", "Field A1", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var a2 = await createHandlerA.Handle(new CreateCustomFieldDefinitionCommand("a_second", "Field A2", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);

        var b1 = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_first", "Field B1", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);
        var b2 = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_second", "Field B2", CustomFieldDataType.Text, DisplayOrder: 2), CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act 1: Tenant A attempts to reorder using OrderedIds containing Tenant B's IDs mixed with Tenant A's
        var orderedIds = new List<Guid> { b1.Id, a2.Id, a1.Id, b2.Id };
        var reorderResult = await reorderHandlerA.Handle(new ReorderCustomFieldsCommand("Patient", orderedIds), CancellationToken.None);

        // Assert - returned list only contains Tenant A's fields, ordered appropriately among Tenant A's own items
        reorderResult.Should().HaveCount(2);
        reorderResult.Select(f => f.Id).Should().NotContain(b1.Id);
        reorderResult.Select(f => f.Id).Should().NotContain(b2.Id);

        // Verify in DB that Tenant B's fields kept their original display order 1 and 2
        dbAdmin.ChangeTracker.Clear();
        var rawB1 = await dbAdmin.Set<CustomFieldDefinition>().IgnoreQueryFilters().FirstAsync(f => f.Id == b1.Id);
        var rawB2 = await dbAdmin.Set<CustomFieldDefinition>().IgnoreQueryFilters().FirstAsync(f => f.Id == b2.Id);
        rawB1.DisplayOrder.Should().Be(1);
        rawB2.DisplayOrder.Should().Be(2);

        // Act 2: Tenant A attempts to reorder using explicit Items targeting ONLY Tenant B's fields
        var maliciousItems = new List<CustomFieldOrderItem>
        {
            new(b1.Id, 9999),
            new(b2.Id, 8888)
        };
        var maliciousResult = await reorderHandlerA.Handle(new ReorderCustomFieldsCommand(items: maliciousItems, entityType: "Patient"), CancellationToken.None);

        // Assert - Tenant A's handler does not return or mutate Tenant B's fields
        maliciousResult.Should().HaveCount(2); // returns Tenant A's existing fields
        dbAdmin.ChangeTracker.Clear();
        var rawB1After = await dbAdmin.Set<CustomFieldDefinition>().IgnoreQueryFilters().FirstAsync(f => f.Id == b1.Id);
        var rawB2After = await dbAdmin.Set<CustomFieldDefinition>().IgnoreQueryFilters().FirstAsync(f => f.Id == b2.Id);
        rawB1After.DisplayOrder.Should().Be(1);
        rawB2After.DisplayOrder.Should().Be(2);
    }

    [Fact]
    public async Task MultiTenant_DeleteIsolation_TenantACannotDeleteTenantBCustomField()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, dbAdmin) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);
        var deleteHandlerA = new DeleteCustomFieldDefinitionCommandHandler(repoA, uowA);

        // Tenant B creates field
        var bField = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand("b_critical", "Critical Data", CustomFieldDataType.Text), CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act - Tenant A attempts to delete Tenant B's field
        var deleteResult = await deleteHandlerA.Handle(new DeleteCustomFieldDefinitionCommand(bField.Id), CancellationToken.None);

        // Assert - Delete returns false (not found in Tenant A's scope)
        deleteResult.Should().BeFalse();

        // Verify in DB that Tenant B's field is NOT deleted
        dbAdmin.ChangeTracker.Clear();
        var rawField = await dbAdmin.Set<CustomFieldDefinition>()
            .IgnoreQueryFilters()
            .FirstAsync(f => f.Id == bField.Id);

        rawField.IsDeleted.Should().BeFalse();
        rawField.DeletedAt.Should().BeNull();
        rawField.DeletedBy.Should().BeNull();
    }

    [Fact]
    public async Task MultiTenant_TemplateInstallation_ShouldKeepTenantsCompletelySeparate()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_USTP");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_Corporate");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, dbAdmin) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var installHandlerA = new InstallCustomFieldTemplateCommandHandler(repoA, uowA, contextA);
        var installHandlerB = new InstallCustomFieldTemplateCommandHandler(repoB, uowB, contextB);
        var queryHandlerA = new GetClinicCustomFieldsQueryHandler(repoA);
        var queryHandlerB = new GetClinicCustomFieldsQueryHandler(repoB);

        // Act - Tenant A installs University preset (8 fields)
        var installedA = await installHandlerA.Handle(new InstallCustomFieldTemplateCommand("university_ustp"), CancellationToken.None);

        // Act - Tenant B installs Corporate preset (4 fields)
        var installedB = await installHandlerB.Handle(new InstallCustomFieldTemplateCommand("workplace_corporate"), CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Assert - Tenant A has exactly 8 fields
        installedA.Should().HaveCount(8);
        var queriedA = await queryHandlerA.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);
        queriedA.Should().HaveCount(8);
        queriedA.All(f => f.TenantId == "tenant_USTP" && f.ClinicId == clinicIdA).Should().BeTrue();

        // Assert - Tenant B has exactly 4 fields
        installedB.Should().HaveCount(4);
        var queriedB = await queryHandlerB.Handle(new GetClinicCustomFieldsQuery("Patient"), CancellationToken.None);
        queriedB.Should().HaveCount(4);
        queriedB.All(f => f.TenantId == "tenant_Corporate" && f.ClinicId == clinicIdB).Should().BeTrue();

        // Verify total in shared database is exactly 8 + 4 = 12
        var totalInDb = await dbAdmin.Set<CustomFieldDefinition>().IgnoreQueryFilters().CountAsync();
        totalInDb.Should().Be(12);
    }

    [Fact]
    public async Task MultiTenant_KeyNamespaceSeparation_SameFieldKeyInDifferentTenants_ShouldNotCollide()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_Alpha");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_Beta");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, uowA, repoA, dbB, uowB, repoB, _) =
            CreateSharedDatabasePair<CustomFieldDefinition>(contextA, contextB);

        var createHandlerA = new CreateCustomFieldDefinitionCommandHandler(repoA, uowA, contextA);
        var createHandlerB = new CreateCustomFieldDefinitionCommandHandler(repoB, uowB, contextB);

        // Act - Both tenants create a field with the EXACT same field key: "student_id"
        var fieldA = await createHandlerA.Handle(new CreateCustomFieldDefinitionCommand(
            "student_id", "Alpha Student ID", CustomFieldDataType.Text), CancellationToken.None);

        var fieldB = await createHandlerB.Handle(new CreateCustomFieldDefinitionCommand(
            "student_id", "Beta Student ID", CustomFieldDataType.Text), CancellationToken.None);

        // Assert - Both exist independently with their respective tenant stamps
        fieldA.Should().NotBeNull();
        fieldA.FieldKey.Should().Be("student_id");
        fieldA.TenantId.Should().Be("tenant_Alpha");
        fieldA.ClinicId.Should().Be(clinicIdA);

        fieldB.Should().NotBeNull();
        fieldB.FieldKey.Should().Be("student_id");
        fieldB.TenantId.Should().Be("tenant_Beta");
        fieldB.ClinicId.Should().Be(clinicIdB);
        fieldB.Id.Should().NotBe(fieldA.Id);
    }

    [Fact]
    public async Task CustomFields_Persistence_NullAndEmptyDictionary_ShouldNormalizeSafely()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_empty_dict");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        // Case 1: Null CustomFields
        var commandNull = CreateRegisterCommand("NullFields", "Patient", null!);
        var p1 = await registerHandler.Handle(commandNull, CancellationToken.None);

        // Case 2: Empty dictionary
        var commandEmpty = CreateRegisterCommand("EmptyFields", "Patient", new Dictionary<string, object?>());
        var p2 = await registerHandler.Handle(commandEmpty, CancellationToken.None);

        context.ChangeTracker.Clear();

        var reloaded1 = await patientRepo.Query().FirstAsync(p => p.Id == p1.Id);
        var reloaded2 = await patientRepo.Query().FirstAsync(p => p.Id == p2.Id);

        // Assert - Both should reload as non-null empty dictionaries
        reloaded1.CustomFields.Should().NotBeNull();
        reloaded1.CustomFields.Should().BeEmpty();

        reloaded2.CustomFields.Should().NotBeNull();
        reloaded2.CustomFields.Should().BeEmpty();
    }

    [Fact]
    public async Task CustomFields_Persistence_SqlAndHtmlInjectionPayloads_ShouldPersistVerbatimWithoutExecutionOrEscapingCorruption()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_injection_tests");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        var injectionPayloads = new Dictionary<string, object?>
        {
            ["sql_injection_1"] = "'; DROP TABLE \"Patients\"; --",
            ["sql_injection_2"] = "1' OR '1'='1",
            ["xss_payload_1"] = "<script>alert('XSS')</script>",
            ["xss_payload_2"] = "<img src=x onerror=alert(document.cookie)>",
            ["json_breaking_string"] = "{\"key\": \"val\"}}}}\",,,,,",
            ["null_byte_string"] = "hello\0world"
        };

        var command = CreateRegisterCommand("Security", "Tester", injectionPayloads);
        var p = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();

        var reloaded = await patientRepo.Query().FirstAsync(patient => patient.Id == p.Id);

        // Assert - all strings are stored and retrieved verbatim without corruption or injection
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields["sql_injection_1"]!.ToString().Should().Be("'; DROP TABLE \"Patients\"; --");
        reloaded.CustomFields["sql_injection_2"]!.ToString().Should().Be("1' OR '1'='1");
        reloaded.CustomFields["xss_payload_1"]!.ToString().Should().Be("<script>alert('XSS')</script>");
        reloaded.CustomFields["xss_payload_2"]!.ToString().Should().Be("<img src=x onerror=alert(document.cookie)>");
        reloaded.CustomFields["json_breaking_string"]!.ToString().Should().Be("{\"key\": \"val\"}}}}\",,,,,");
        reloaded.CustomFields["null_byte_string"]!.ToString().Should().Be("hello\0world");
    }

    [Fact]
    public async Task CustomFields_Persistence_DeeplyNestedStructures_ShouldPreserveMultiLevelHierarchy()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant_deep_nesting");
        clinicContext.ClinicId.Returns(clinicId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinicContext);

        // 4 levels of nesting
        var deepStructure = new Dictionary<string, object?>
        {
            ["level1"] = new Dictionary<string, object?>
            {
                ["level2"] = new Dictionary<string, object?>
                {
                    ["level3"] = new Dictionary<string, object?>
                    {
                        ["leaf_node"] = "Deep Value",
                        ["leaf_metric"] = 42.195
                    }
                }
            }
        };

        var command = CreateRegisterCommand("Deep", "Explorer", deepStructure);
        var p = await registerHandler.Handle(command, CancellationToken.None);

        context.ChangeTracker.Clear();

        var reloaded = await patientRepo.Query().FirstAsync(patient => patient.Id == p.Id);

        // Assert
        reloaded.CustomFields.Should().NotBeNull();
        var l1 = (JsonElement)reloaded.CustomFields["level1"]!;
        var l2 = l1.GetProperty("level2");
        var l3 = l2.GetProperty("level3");
        l3.GetProperty("leaf_node").GetString().Should().Be("Deep Value");
        l3.GetProperty("leaf_metric").GetDouble().Should().BeApproximately(42.195, 0.001);
    }

    [Fact]
    public async Task MultiTenant_PatientLevel_TenantACannotAccessTenantBPatientOrTheirCustomFields()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();

        var contextA = Substitute.For<IClinicContext>();
        contextA.TenantId.Returns("tenant_Hospital_A");
        contextA.ClinicId.Returns(clinicIdA);

        var contextB = Substitute.For<IClinicContext>();
        contextB.TenantId.Returns("tenant_Hospital_B");
        contextB.ClinicId.Returns(clinicIdB);

        var (dbA, _, repoA, dbB, uowB, repoB, _) =
            CreateSharedDatabasePair<Patient>(contextA, contextB);

        var registerHandlerB = new RegisterClinicPatientCommandHandler(repoB, uowB, contextB);
        var getByIdHandlerA = new GetClinicPatientByIdQueryHandler(repoA);
        var getPatientsHandlerA = new GetClinicPatientsQueryHandler(repoA);

        var bPatientFields = new Dictionary<string, object?>
        {
            ["vip_status"] = "Confidential Celebrity Patient",
            ["private_ward"] = "Suite 501"
        };

        var commandB = CreateRegisterCommand("Private", "VIP", bPatientFields);
        var patientB = await registerHandlerB.Handle(commandB, CancellationToken.None);

        dbA.ChangeTracker.Clear();
        dbB.ChangeTracker.Clear();

        // Act 1: Tenant A queries by ID for Tenant B's patient
        var queryByIdResult = await getByIdHandlerA.Handle(new GetClinicPatientByIdQuery(patientB.Id), CancellationToken.None);

        // Assert 1: Tenant A cannot fetch Tenant B's patient
        queryByIdResult.Should().BeNull();

        // Act 2: Tenant A lists all patients
        var listResult = await getPatientsHandlerA.Handle(new GetClinicPatientsQuery(), CancellationToken.None);

        // Assert 2: Tenant A patient list is empty, Tenant B's patient does NOT appear
        listResult.Should().BeEmpty();
    }

    [Fact]
    public async Task MultiTenant_Reorder_NonExistentGuids_ShouldGracefullyIgnore()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var context = Substitute.For<IClinicContext>();
        context.TenantId.Returns("tenant_reorder_resilience");
        context.ClinicId.Returns(clinicId);

        var (contextDb, uow, sieve) = TestDbHelper.CreateTestContext(context);
        var repo = TestDbHelper.CreateRepository<CustomFieldDefinition>(contextDb, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, context);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, context);

        var existingField = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "existing_field", "Existing Field", CustomFieldDataType.Text, DisplayOrder: 1), CancellationToken.None);

        // Act - Reorder with non-existent random GUIDs alongside real ID
        var randomGuid1 = Guid.NewGuid();
        var randomGuid2 = Guid.NewGuid();
        var orderedIds = new List<Guid> { randomGuid1, existingField.Id, randomGuid2 };

        var result = await reorderHandler.Handle(new ReorderCustomFieldsCommand("Patient", orderedIds), CancellationToken.None);

        // Assert - Only the existing field is processed and returned, no exception thrown
        result.Should().HaveCount(1);
        result[0].Id.Should().Be(existingField.Id);
        result[0].DisplayOrder.Should().Be(2); // Was index 1 -> 1+1 = 2
    }
}
