using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class JoinCodeSettingsExpirationTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-join-code-expiration-test";

    public JoinCodeSettingsExpirationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task UpdateFacilitySettings_SetJoinCodeWithExpiration_PersistsBothCodeAndExpiry()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        var expiry = DateTime.UtcNow.AddDays(7);
        var command = new UpdateClinicSettingsCommand(
            JoinCode: "pass1234",
            JoinCodeExpiresAt: expiry);

        // Act
        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert DTO
        result.JoinCode.Should().Be("PASS1234");
        result.JoinCodeExpiresAt.Should().Be(expiry);

        // Assert DB persistence
        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.JoinCode.Should().Be("PASS1234");
        persisted.JoinCodeExpiresAt.Should().Be(expiry);
    }

    [Fact]
    public async Task UpdateFacilitySettings_ClearJoinCodeExpiresAt_ClearsExpiryWhilePreservingPasscode()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Step 1: Seed existing passcode with expiration
        var initialExpiry = DateTime.UtcNow.AddHours(24);
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            JoinCode: "CARE2026",
            JoinCodeExpiresAt: initialExpiry), CancellationToken.None);

        // Step 2: Switch to "Never" via ClearJoinCodeExpiresAt
        var clearExpiryCommand = new UpdateClinicSettingsCommand(
            JoinCode: "CARE2026",
            ClearJoinCodeExpiresAt: true);

        // Act
        var result = await updateHandler.Handle(clearExpiryCommand, CancellationToken.None);

        // Assert DTO
        result.JoinCode.Should().Be("CARE2026");
        result.JoinCodeExpiresAt.Should().BeNull("Expiration must be cleared to null when ClearJoinCodeExpiresAt is true");

        // Assert DB persistence
        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.JoinCode.Should().Be("CARE2026");
        persisted.JoinCodeExpiresAt.Should().BeNull();
    }

    [Fact]
    public async Task UpdateFacilitySettings_SetNewExpirationOnExistingPasscode_UpdatesExpiry()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Seed with 24h
        var initialExpiry = DateTime.UtcNow.AddHours(24);
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            JoinCode: "CARE2026",
            JoinCodeExpiresAt: initialExpiry), CancellationToken.None);

        // Update to 30d
        var updatedExpiry = DateTime.UtcNow.AddDays(30);
        var updateCommand = new UpdateClinicSettingsCommand(
            JoinCode: "CARE2026",
            JoinCodeExpiresAt: updatedExpiry);

        // Act
        var result = await updateHandler.Handle(updateCommand, CancellationToken.None);

        // Assert
        result.JoinCode.Should().Be("CARE2026");
        result.JoinCodeExpiresAt.Should().Be(updatedExpiry);

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.JoinCodeExpiresAt.Should().Be(updatedExpiry);
    }

    [Fact]
    public async Task UpdateFacilitySettings_ClearJoinCode_ClearsBothPasscodeAndExpiry()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Seed with passcode and expiry
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            JoinCode: "CLEARME",
            JoinCodeExpiresAt: DateTime.UtcNow.AddDays(7)), CancellationToken.None);

        // Clear join code
        var clearCommand = new UpdateClinicSettingsCommand(ClearJoinCode: true);

        // Act
        var result = await updateHandler.Handle(clearCommand, CancellationToken.None);

        // Assert
        result.JoinCode.Should().BeNull();
        result.JoinCodeExpiresAt.Should().BeNull();

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.JoinCode.Should().BeNull();
        persisted.JoinCodeExpiresAt.Should().BeNull();
    }

    [Fact]
    public async Task UpdateFacilitySettings_EmptyOrWhitespaceJoinCode_ClearsBothPasscodeAndExpiry()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Seed
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            JoinCode: "INITIAL",
            JoinCodeExpiresAt: DateTime.UtcNow.AddDays(7)), CancellationToken.None);

        // Update with empty/whitespace string
        var emptyCommand = new UpdateClinicSettingsCommand(JoinCode: "   ");

        // Act
        var result = await updateHandler.Handle(emptyCommand, CancellationToken.None);

        // Assert
        result.JoinCode.Should().BeNull();
        result.JoinCodeExpiresAt.Should().BeNull();

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.JoinCode.Should().BeNull();
        persisted.JoinCodeExpiresAt.Should().BeNull();
    }

    [Fact]
    public async Task UpdateFacilitySettings_UnrelatedSettingsUpdate_PreservesPasscodeAndExpiry()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        var expiry = DateTime.UtcNow.AddDays(14);
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            JoinCode: "PRESERVE",
            JoinCodeExpiresAt: expiry), CancellationToken.None);

        // Update only ClinicName
        var nameCommand = new UpdateClinicSettingsCommand(ClinicName: "Renamed Clinic Facility");

        // Act
        var result = await updateHandler.Handle(nameCommand, CancellationToken.None);

        // Assert
        result.ClinicName.Should().Be("Renamed Clinic Facility");
        result.JoinCode.Should().Be("PRESERVE");
        result.JoinCodeExpiresAt.Should().Be(expiry);

        var persisted = await context.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.ClinicName.Should().Be("Renamed Clinic Facility");
        persisted.JoinCode.Should().Be("PRESERVE");
        persisted.JoinCodeExpiresAt.Should().Be(expiry);
    }
}
