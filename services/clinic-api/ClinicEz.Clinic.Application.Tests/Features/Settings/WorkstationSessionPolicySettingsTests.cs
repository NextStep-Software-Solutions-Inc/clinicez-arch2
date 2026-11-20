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

public class WorkstationSessionPolicySettingsTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string TestTenantId = "tenant-session-policy-test";

    public WorkstationSessionPolicySettingsTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(TestTenantId);
    }

    [Fact]
    public async Task GetClinicSettings_AutoProvisioned_HasExpectedSessionPolicyDefaults()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        result.IdleLockMinutes.Should().Be(15);
        result.MaxLockedSessionHours.Should().Be(8);
        result.AllowStaffPinUnlock.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatesAndPersistsSessionPolicy()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        var updated = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            IdleLockMinutes: 10,
            MaxLockedSessionHours: 4,
            AllowStaffPinUnlock: false), CancellationToken.None);

        updated.IdleLockMinutes.Should().Be(10);
        updated.MaxLockedSessionHours.Should().Be(4);
        updated.AllowStaffPinUnlock.Should().BeFalse();

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.IdleLockMinutes.Should().Be(10);
        persisted.MaxLockedSessionHours.Should().Be(4);
        persisted.AllowStaffPinUnlock.Should().BeFalse();
    }

    [Theory]
    [InlineData(0, 8, true)]
    [InlineData(5, 1, true)]
    [InlineData(120, 24, true)]
    public void Validator_AcceptsValidSessionPolicyBounds(int idleMinutes, int maxHours, bool expectedValid)
    {
        var validator = new UpdateClinicSettingsCommandValidator();
        var result = validator.Validate(new UpdateClinicSettingsCommand(
            IdleLockMinutes: idleMinutes,
            MaxLockedSessionHours: maxHours));

        result.IsValid.Should().Be(expectedValid);
    }

    [Theory]
    [InlineData(3, 8)]
    [InlineData(121, 8)]
    [InlineData(15, 0)]
    [InlineData(15, 25)]
    public void Validator_RejectsOutOfRangeSessionPolicy(int idleMinutes, int maxHours)
    {
        var validator = new UpdateClinicSettingsCommandValidator();
        var result = validator.Validate(new UpdateClinicSettingsCommand(
            IdleLockMinutes: idleMinutes,
            MaxLockedSessionHours: maxHours));

        result.IsValid.Should().BeFalse();
    }
}
