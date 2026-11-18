using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

/// <summary>
/// Adversarial stress tests for Milestone 1 Settings & Validation:
/// - UpdateClinicSettingsCommandValidator boundary & edge cases
/// - Auto-provisioning defaults and query handler idempotency
/// - Partial update non-destructive isolation
/// - Command handler normalization and resiliency
/// - Legacy/corrupted DB fallback handling
/// - Non-teleconsult command isolation (RevertPhilHealthToBranch, OverridePhilHealthSettings)
/// </summary>
public class AdversarialTeleconsultSettingsChallengerTests
{
    private readonly UpdateClinicSettingsCommandValidator _validator = new();
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-adv-challenger-m1";

    public AdversarialTeleconsultSettingsChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    #region 1. UpdateClinicSettingsCommandValidator - RetentionDays Boundaries

    [Theory]
    [InlineData(0)]                   // Indefinite retention - MUST pass
    [InlineData(1)]                   // Lowest positive day - MUST pass
    [InlineData(90)]                  // Standard default - MUST pass
    [InlineData(int.MaxValue)]        // Max 32-bit signed int boundary (2,147,483,647) - MUST pass
    public void Validator_RetentionDays_ValidBoundaries_PassValidation(int days)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: days);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-1)]                  // Negative one - MUST fail
    [InlineData(int.MinValue)]        // Min 32-bit signed int (-2,147,483,648) - MUST fail
    [InlineData(-999999)]             // Arbitrary large negative - MUST fail
    public void Validator_RetentionDays_NegativeBoundaries_FailValidation(int negativeDays)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: negativeDays);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingRetentionDays));
    }

    #endregion

    #region 2. UpdateClinicSettingsCommandValidator - DefaultFee Boundaries

    [Fact]
    public void Validator_DefaultFee_ZeroFee_FreeConsultation_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: 0.00m);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_DefaultFee_DecimalMaxValue_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: decimal.MaxValue);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-1000.0)]
    public void Validator_DefaultFee_NegativeBoundaries_FailValidation(double negativeFeeDbl)
    {
        decimal negativeFee = (decimal)negativeFeeDbl;
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: negativeFee);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultDefaultFee));
    }

    #endregion

    #region 3. UpdateClinicSettingsCommandValidator - RecordingPolicy Exhaustive

    [Theory]
    [InlineData("Disabled")]
    [InlineData("WorkspaceVaultOnly")]
    [InlineData("Both")]
    [InlineData("LocalDeviceOnly")]
    // Case variations
    [InlineData("disabled")]
    [InlineData("DISABLED")]
    [InlineData("dIsAbLeD")]
    [InlineData("workspacevaultonly")]
    [InlineData("WORKSPACEVAULTONLY")]
    [InlineData("both")]
    [InlineData("BOTH")]
    [InlineData("localdeviceonly")]
    [InlineData("LOCALDEVICEONLY")]
    // Whitespace padding
    [InlineData("  Disabled  ")]
    [InlineData("\tWorkspaceVaultOnly\n")]
    [InlineData(" Both ")]
    [InlineData("  LocalDeviceOnly  \r\n")]
    public void Validator_RecordingPolicy_ValidAndNormalizedVariations_PassValidation(string policy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: policy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("cloud")]
    [InlineData("vault")]
    [InlineData("DROP TABLE")]
    [InlineData("None")]
    [InlineData("Enabled")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    [InlineData("Both\0")]
    [InlineData("Disabled\u200B")]
    [InlineData("🔥")]
    [InlineData("Both; DELETE FROM Settings")]
    public void Validator_RecordingPolicy_InvalidOrAdversarialStrings_FailValidation(string invalidPolicy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: invalidPolicy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingPolicy));
    }

    #endregion

    #region 4. UpdateClinicSettingsCommandValidator - PaymentPolicy Enum Bounds

    [Theory]
    [InlineData(TeleconsultPaymentPolicy.Prepaid)]
    [InlineData(TeleconsultPaymentPolicy.Postpaid)]
    [InlineData(TeleconsultPaymentPolicy.Exempt)]
    public void Validator_PaymentPolicy_ValidEnumValues_PassValidation(TeleconsultPaymentPolicy policy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultPaymentPolicy: policy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(999)]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    [InlineData(int.MaxValue)]
    [InlineData(42)]
    public void Validator_PaymentPolicy_InvalidEnumCasts_FailValidation(int invalidCast)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultPaymentPolicy: (TeleconsultPaymentPolicy)invalidCast);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultPaymentPolicy));
    }

    #endregion

    #region 5. UpdateClinicSettingsCommandValidator - Partial Updates & Null Safety

    [Fact]
    public void Validator_PartialUpdate_OnlyNonTeleconsultFields_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(
            ClinicName: "Updated Clinic Name Only",
            OperatingHours: "08:00 - 17:00",
            DefaultConsultationFee: 500m
        );
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_EmptyCommand_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand();
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    #endregion

    #region 6. Handler Auto-Provisioning & Idempotency

    [Fact]
    public async Task GetClinicSettings_AutoProvisioning_HasExactTeleconsultDefaults()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var dto = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert DTO
        dto.Should().NotBeNull();
        dto.TeleconsultRecordingPolicy.Should().Be("Disabled");
        dto.TeleconsultRecordingRetentionDays.Should().Be(90);
        dto.TeleconsultRecordingConsentRequired.Should().BeTrue();
        dto.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        dto.TeleconsultDefaultFee.Should().Be(400.00m);

        // Assert Entity in DB
        var persisted = await context.Settings.FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.TeleconsultRecordingPolicy.Should().Be("Disabled");
        persisted.TeleconsultRecordingRetentionDays.Should().Be(90);
        persisted.TeleconsultRecordingConsentRequired.Should().BeTrue();
        persisted.TeleconsultPaymentPolicy.Should().Be("Prepaid");
        persisted.TeleconsultDefaultFee.Should().Be(400.00m);
    }

    [Fact]
    public async Task GetClinicSettings_SequentialQueries_Idempotent_CreatesExactlyOneEntity()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act: Execute query 5 times sequentially on empty DB
        for (int i = 0; i < 5; i++)
        {
            var dto = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
            dto.TeleconsultRecordingPolicy.Should().Be("Disabled");
            dto.TeleconsultRecordingRetentionDays.Should().Be(90);
        }

        // Assert: Exactly 1 record exists in database
        var totalSettings = await context.Settings.CountAsync();
        totalSettings.Should().Be(1, "Auto-provisioning must be idempotent and never duplicate settings");
    }

    [Fact]
    public async Task UpdateClinicSettings_RepeatedUpdates_AreIdempotent()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        var command = new UpdateClinicSettingsCommand(
            TeleconsultRecordingPolicy: "Both",
            TeleconsultRecordingRetentionDays: 60,
            TeleconsultRecordingConsentRequired: false,
            TeleconsultPaymentPolicy: TeleconsultPaymentPolicy.Exempt,
            TeleconsultDefaultFee: 250.00m
        );

        // Act: Run update 3 times sequentially
        ClinicSettingsDto? lastDto = null;
        for (int i = 0; i < 3; i++)
        {
            lastDto = await updateHandler.Handle(command, CancellationToken.None);
        }

        // Assert
        lastDto.Should().NotBeNull();
        lastDto!.TeleconsultRecordingPolicy.Should().Be("Both");
        lastDto.TeleconsultRecordingRetentionDays.Should().Be(60);
        lastDto.TeleconsultRecordingConsentRequired.Should().BeFalse();
        lastDto.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        lastDto.TeleconsultDefaultFee.Should().Be(250.00m);

        var persistedCount = await context.Settings.CountAsync();
        persistedCount.Should().Be(1);

        var persisted = await context.Settings.FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.TeleconsultRecordingPolicy.Should().Be("Both");
        persisted.TeleconsultRecordingRetentionDays.Should().Be(60);
        persisted.TeleconsultPaymentPolicy.Should().Be("Exempt");
        persisted.TeleconsultDefaultFee.Should().Be(250.00m);
    }

    #endregion

    #region 7. Partial Updates Preserve Existing Teleconsult Settings

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyNonTeleconsultFields_PreservesAllCustomTeleconsultSettings()
    {
        // Arrange: Seed database with custom teleconsult settings
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        var setupCommand = new UpdateClinicSettingsCommand(
            TeleconsultRecordingPolicy: "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays: 180,
            TeleconsultRecordingConsentRequired: false,
            TeleconsultPaymentPolicy: TeleconsultPaymentPolicy.Postpaid,
            TeleconsultDefaultFee: 850.00m
        );
        await updateHandler.Handle(setupCommand, CancellationToken.None);

        // Act: Update only non-teleconsult fields (ClinicName, OperatingHours, QueuePrefix)
        var update1 = await updateHandler.Handle(new UpdateClinicSettingsCommand(ClinicName: "Brand New Clinic"), CancellationToken.None);
        update1.ClinicName.Should().Be("Brand New Clinic");
        update1.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        update1.TeleconsultRecordingRetentionDays.Should().Be(180);
        update1.TeleconsultRecordingConsentRequired.Should().BeFalse();
        update1.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        update1.TeleconsultDefaultFee.Should().Be(850.00m);

        var update2 = await updateHandler.Handle(new UpdateClinicSettingsCommand(OperatingHours: "07:00 - 19:00", QueuePrefix: "QP"), CancellationToken.None);
        update2.QueuePrefix.Should().Be("QP");
        update2.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        update2.TeleconsultRecordingRetentionDays.Should().Be(180);
        update2.TeleconsultRecordingConsentRequired.Should().BeFalse();
        update2.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        update2.TeleconsultDefaultFee.Should().Be(850.00m);

        // Act: Update only a single teleconsult field (e.g., RetentionDays to 0 for indefinite)
        var update3 = await updateHandler.Handle(new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: 0), CancellationToken.None);
        update3.TeleconsultRecordingRetentionDays.Should().Be(0);
        // All other 4 teleconsult fields remain unchanged
        update3.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        update3.TeleconsultRecordingConsentRequired.Should().BeFalse();
        update3.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        update3.TeleconsultDefaultFee.Should().Be(850.00m);

        // Verify direct database persistence
        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.ClinicName.Should().Be("Brand New Clinic");
        persisted.QueuePrefix.Should().Be("QP");
        persisted.TeleconsultRecordingRetentionDays.Should().Be(0);
        persisted.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        persisted.TeleconsultRecordingConsentRequired.Should().BeFalse();
        persisted.TeleconsultPaymentPolicy.Should().Be("Postpaid");
        persisted.TeleconsultDefaultFee.Should().Be(850.00m);
    }

    #endregion

    #region 8. Handler Normalization & Resiliency Edge Cases

    [Theory]
    [InlineData("  workspacevaultonly  ", "WorkspaceVaultOnly")]
    [InlineData("both", "Both")]
    [InlineData("LOCALDEVICEONLY", "LocalDeviceOnly")]
    [InlineData("  disabled  ", "Disabled")]
    public async Task UpdateClinicSettings_HandlerNormalizesPolicyToCanonicalPascalCase(string inputPolicy, string expectedCanonical)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await updateHandler.Handle(new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: inputPolicy), CancellationToken.None);

        // Assert
        result.TeleconsultRecordingPolicy.Should().Be(expectedCanonical);

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.TeleconsultRecordingPolicy.Should().Be(expectedCanonical);
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenCalledOnEmptyDb_AutoProvisionsFacilitySettingsWithSuppliedValues()
    {
        // Arrange: Empty DB
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: Call update directly without prior Get query
        var result = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Initial Facility",
            TeleconsultDefaultFee: 600m,
            TeleconsultPaymentPolicy: TeleconsultPaymentPolicy.Postpaid
        ), CancellationToken.None);

        // Assert
        result.ClinicName.Should().Be("Initial Facility");
        result.TeleconsultDefaultFee.Should().Be(600m);
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        // Unspecified teleconsult fields retain entity defaults
        result.TeleconsultRecordingPolicy.Should().Be("Disabled");
        result.TeleconsultRecordingRetentionDays.Should().Be(90);
        result.TeleconsultRecordingConsentRequired.Should().BeTrue();

        var persisted = await context.Settings.FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.ClinicName.Should().Be("Initial Facility");
        persisted.TeleconsultDefaultFee.Should().Be(600m);
        persisted.TeleconsultPaymentPolicy.Should().Be("Postpaid");
    }

    #endregion

    #region 9. Legacy / Corrupted DB Resiliency & Cross-Command Preservation

    [Fact]
    public async Task GetClinicSettings_WhenCorruptedDatabaseValues_SafelyFallsBackToDefaults()
    {
        // Arrange: Directly insert settings with corrupted / unexpected strings in teleconsult columns
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var corrupted = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Corrupted Settings Clinic",
            TeleconsultRecordingPolicy = "CorruptedPolicyValue", // unexpected string in DB
            TeleconsultPaymentPolicy = "InvalidCorruptedPolicyString", // invalid enum string
            TeleconsultRecordingRetentionDays = 0,
            TeleconsultRecordingConsentRequired = false,
            TeleconsultDefaultFee = 0.00m
        };
        await settingsRepo.AddAsync(corrupted, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert: Safely maps and falls back to defaults for payment policy enum
        result.TeleconsultRecordingPolicy.Should().Be("CorruptedPolicyValue");
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid, "Corrupted payment policy must fall back to Prepaid");
        result.TeleconsultRecordingRetentionDays.Should().Be(0);
        result.TeleconsultRecordingConsentRequired.Should().BeFalse();
        result.TeleconsultDefaultFee.Should().Be(0.00m);
    }

    [Fact]
    public async Task RevertPhilHealthToBranch_PreservesExistingTeleconsultSettings()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var existing = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "PhilHealth Revert Test Clinic",
            BranchPhilHealthAccreditationNumber = "PH-BRANCH-TEST",
            IsBranchPhilHealthAccredited = true,
            TeleconsultRecordingPolicy = "LocalDeviceOnly",
            TeleconsultRecordingRetentionDays = 45,
            TeleconsultRecordingConsentRequired = false,
            TeleconsultPaymentPolicy = "Postpaid",
            TeleconsultDefaultFee = 999.00m
        };
        await settingsRepo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new RevertPhilHealthToBranchCommandHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);

        // Assert: PhilHealth was reverted, but teleconsult settings were 100% preserved!
        result.TeleconsultRecordingPolicy.Should().Be("LocalDeviceOnly");
        result.TeleconsultRecordingRetentionDays.Should().Be(45);
        result.TeleconsultRecordingConsentRequired.Should().BeFalse();
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.TeleconsultDefaultFee.Should().Be(999.00m);
    }

    [Fact]
    public async Task OverridePhilHealthSettings_PreservesExistingTeleconsultSettings()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var existing = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "PhilHealth Override Test Clinic",
            TeleconsultRecordingPolicy = "Both",
            TeleconsultRecordingRetentionDays = 120,
            TeleconsultRecordingConsentRequired = true,
            TeleconsultPaymentPolicy = "Exempt",
            TeleconsultDefaultFee = 0.00m
        };
        await settingsRepo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var statusResponse = new PhilHealthConfigStatusResponse(
            TenantId: _testClinicId,
            FacilityName: "PhilHealth Override Test Clinic",
            AccreditationNumber: "OVERRIDE-123",
            PmccNumber: "PMCC-123",
            SoftwareCertificateId: "CERT-123",
            KonsultaEndpoint: "/soap/custom",
            IsConfigured: true,
            IsActive: true,
            UpdatedAt: DateTimeOffset.UtcNow);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.ConfigureTenantCredentialsAsync(Arg.Any<ConfigurePhilHealthCredentialsProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<PhilHealthConfigStatusResponse>.Success(statusResponse));

        var handler = new OverridePhilHealthSettingsCommandHandler(settingsRepo, _clinicContext, uow, proxyClient);

        var command = new OverridePhilHealthSettingsCommand(
            AccreditationNumber: "OVERRIDE-123",
            PmccNumber: "PMCC-123",
            SoftwareCertificateId: "CERT-123",
            Username: "user",
            Password: "pwd",
            CipherKey: "cipher-key-test-32-chars-long!!");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Teleconsult settings remained intact
        result.TeleconsultRecordingPolicy.Should().Be("Both");
        result.TeleconsultRecordingRetentionDays.Should().Be(120);
        result.TeleconsultRecordingConsentRequired.Should().BeTrue();
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.TeleconsultDefaultFee.Should().Be(0.00m);
    }

    #endregion
}
