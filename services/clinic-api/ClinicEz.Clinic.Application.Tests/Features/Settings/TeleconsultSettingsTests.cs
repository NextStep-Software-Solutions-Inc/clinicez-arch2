using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class TeleconsultSettingsTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-teleconsult-settings-test";

    public TeleconsultSettingsTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public void FacilitySettings_DirectInstantiation_HasExpectedTeleconsultDefaults()
    {
        var settings = new FacilitySettings { ClinicName = "Test Clinic" };
        settings.TeleconsultRecordingPolicy.Should().Be("Disabled");
        settings.TeleconsultRecordingRetentionDays.Should().Be(90);
        settings.TeleconsultRecordingConsentRequired.Should().BeTrue();
        settings.TeleconsultPaymentPolicy.Should().Be("Prepaid");
        settings.TeleconsultDefaultFee.Should().Be(400.00m);
        settings.TeleconsultAutoExemptYakap.Should().BeTrue();
    }

    [Fact]
    public void ClinicSettingsDto_DefaultConstructor_HasExpectedTeleconsultDefaults()
    {
        var dto = new ClinicSettingsDto(
            Id: Guid.NewGuid(),
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Test Clinic",
            TaxIdentificationNumber: null,
            AccreditationNumber: null,
            OperatingHours: "08:00 - 17:00",
            DefaultSlotDurationMinutes: 30,
            QueuePrefix: "Q",
            InvoicePrefix: "INV",
            DefaultConsultationFee: 400.00m,
            VatRate: 0.12m,
            LetterheadHeader: null,
            LetterheadSubHeader: null,
            LetterheadAddress: null,
            LetterheadContact: null,
            LetterheadFooter: null);

        dto.TeleconsultRecordingPolicy.Should().Be("Disabled");
        dto.TeleconsultRecordingRetentionDays.Should().Be(90);
        dto.TeleconsultRecordingConsentRequired.Should().BeTrue();
        dto.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        dto.TeleconsultDefaultFee.Should().Be(400.00m);
    }

    [Fact]
    public async Task GetClinicSettings_WhenNoSettingsExist_AutoProvisionsWithTeleconsultDefaults()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert DTO
        result.Should().NotBeNull();
        result.TeleconsultRecordingPolicy.Should().Be("Disabled");
        result.TeleconsultRecordingRetentionDays.Should().Be(90);
        result.TeleconsultRecordingConsentRequired.Should().BeTrue();
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.TeleconsultDefaultFee.Should().Be(400.00m);

        // Assert DB Persisted Entity
        var persisted = await context.Settings.FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.TeleconsultRecordingPolicy.Should().Be("Disabled");
        persisted.TeleconsultRecordingRetentionDays.Should().Be(90);
        persisted.TeleconsultRecordingConsentRequired.Should().BeTrue();
        persisted.TeleconsultPaymentPolicy.Should().Be("Prepaid");
        persisted.TeleconsultDefaultFee.Should().Be(400.00m);
    }

    [Fact]
    public async Task GetClinicSettings_WhenExistingSettingsHaveCustomTeleconsultValues_MapsProperlyToDto()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var existing = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Custom Teleconsult Facility",
            OperatingHours = "09:00 - 18:00",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 180,
            TeleconsultRecordingConsentRequired = false,
            TeleconsultPaymentPolicy = "Postpaid",
            TeleconsultDefaultFee = 750.50m
        };
        await settingsRepo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        result.TeleconsultRecordingRetentionDays.Should().Be(180);
        result.TeleconsultRecordingConsentRequired.Should().BeFalse();
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.TeleconsultDefaultFee.Should().Be(750.50m);
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingAllTeleconsultProperties_PersistsAndReturnsUpdatedDto()
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
            TeleconsultDefaultFee: 500.00m
        );

        // Act
        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert DTO
        result.TeleconsultRecordingPolicy.Should().Be("Both");
        result.TeleconsultRecordingRetentionDays.Should().Be(60);
        result.TeleconsultRecordingConsentRequired.Should().BeFalse();
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.TeleconsultDefaultFee.Should().Be(500.00m);

        // Assert DB
        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.TeleconsultRecordingPolicy.Should().Be("Both");
        persisted.TeleconsultRecordingRetentionDays.Should().Be(60);
        persisted.TeleconsultRecordingConsentRequired.Should().BeFalse();
        persisted.TeleconsultPaymentPolicy.Should().Be("Exempt");
        persisted.TeleconsultDefaultFee.Should().Be(500.00m);
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyRecordingPolicy_LeavesOtherTeleconsultFieldsUntouched()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Provision defaults
        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Act
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: "WorkspaceVaultOnly");
        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        result.TeleconsultRecordingRetentionDays.Should().Be(90, "Retention days should remain default");
        result.TeleconsultRecordingConsentRequired.Should().BeTrue("Consent requirement should remain default");
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid, "Payment policy should remain default");
        result.TeleconsultDefaultFee.Should().Be(400.00m, "Default fee should remain default");
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingRetentionDaysToZero_IndicatesIndefiniteRetention()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: 0 means indefinite retention
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: 0);
        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.TeleconsultRecordingRetentionDays.Should().Be(0);

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.TeleconsultRecordingRetentionDays.Should().Be(0);
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingDefaultFeeToZero_AllowsFreeTeleconsultation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: 0m fee is valid
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: 0m);
        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.TeleconsultDefaultFee.Should().Be(0m);

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.TeleconsultDefaultFee.Should().Be(0m);
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingNonTeleconsultSettings_PreservesTeleconsultSettings()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Initial setup with custom teleconsult settings
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            TeleconsultRecordingPolicy: "Both",
            TeleconsultRecordingRetentionDays: 120,
            TeleconsultPaymentPolicy: TeleconsultPaymentPolicy.Exempt,
            TeleconsultDefaultFee: 650m), CancellationToken.None);

        // Act - Update only clinic name and operating hours
        var result = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Renamed Facility",
            OperatingHours: "08:00 - 17:00"), CancellationToken.None);

        // Assert
        result.ClinicName.Should().Be("Renamed Facility");
        result.TeleconsultRecordingPolicy.Should().Be("Both");
        result.TeleconsultRecordingRetentionDays.Should().Be(120);
        result.TeleconsultPaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.TeleconsultDefaultFee.Should().Be(650m);
    }
}
