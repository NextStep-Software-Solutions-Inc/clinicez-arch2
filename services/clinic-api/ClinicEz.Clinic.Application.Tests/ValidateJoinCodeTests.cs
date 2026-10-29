using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ValidateJoinCodeTests
{
    private readonly IClinicContext _clinicContext;

    public ValidateJoinCodeTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns("tenant-apex");
        _clinicContext.ClinicId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task ValidateJoinCode_ValidActiveCode_ReturnsOkWithClinicAndTenantDetails()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new ValidateJoinCodeQueryHandler(repo);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "apex-health",
            TenantSlug = "apex-health-center",
            ClinicId = Guid.NewGuid(),
            FacilitySlug = "main-campus",
            ClinicName = "Apex Health Medical Center",
            LetterheadAddress = "123 Health Ave, Manila",
            OperatingHours = "Mon-Fri 8am-5pm",
            IsJoinEnabled = true,
            JoinCode = "APEX2026",
            JoinCodeExpiresAt = DateTime.UtcNow.AddDays(7),
        };
        await context.Settings.AddAsync(clinic);
        await context.SaveChangesAsync();

        var query = new ValidateJoinCodeQuery("APEX2026");
        var result = await handler.Handle(query, CancellationToken.None);

        result.IsValid.Should().BeTrue();
        result.StatusCode.Should().Be(200);
        result.TenantSlug.Should().Be("apex-health-center");
        result.FacilitySlug.Should().Be("main-campus");
        result.FacilityName.Should().Be("Apex Health Medical Center");
        result.FacilityAddress.Should().Be("123 Health Ave, Manila");
        result.ExpiresAt.Should().Be(clinic.JoinCodeExpiresAt);
    }

    [Fact]
    public async Task ValidateJoinCode_CaseInsensitiveAndWhitespaceTolerant()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new ValidateJoinCodeQueryHandler(repo);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "apex-health",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Apex Health",
            IsJoinEnabled = true,
            JoinCode = "JOIN123",
            JoinCodeExpiresAt = null,
        };
        await context.Settings.AddAsync(clinic);
        await context.SaveChangesAsync();

        var query = new ValidateJoinCodeQuery("  join123  ");
        var result = await handler.Handle(query, CancellationToken.None);

        result.IsValid.Should().BeTrue();
        result.StatusCode.Should().Be(200);
        result.FacilityName.Should().Be("Apex Health");
    }

    [Fact]
    public async Task ValidateJoinCode_NonExistentCode_Returns404()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new ValidateJoinCodeQueryHandler(repo);

        var query = new ValidateJoinCodeQuery("UNKNOWN_CODE");
        var result = await handler.Handle(query, CancellationToken.None);

        result.IsValid.Should().BeFalse();
        result.StatusCode.Should().Be(404);
        result.ErrorMessage.Should().Contain("Invalid clinic join code");
    }

    [Fact]
    public async Task ValidateJoinCode_DisabledIntake_Returns400()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new ValidateJoinCodeQueryHandler(repo);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "apex-health",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Apex Health",
            IsJoinEnabled = false,
            JoinCode = "OFFLINE2026",
        };
        await context.Settings.AddAsync(clinic);
        await context.SaveChangesAsync();

        var query = new ValidateJoinCodeQuery("OFFLINE2026");
        var result = await handler.Handle(query, CancellationToken.None);

        result.IsValid.Should().BeFalse();
        result.StatusCode.Should().Be(400);
        result.ErrorMessage.Should().Contain("disabled");
    }

    [Fact]
    public async Task ValidateJoinCode_ExpiredCode_Returns410()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new ValidateJoinCodeQueryHandler(repo);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "apex-health",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Apex Health",
            IsJoinEnabled = true,
            JoinCode = "EXPIRED2026",
            JoinCodeExpiresAt = DateTime.UtcNow.AddHours(-2), // Lapsed 2 hours ago
        };
        await context.Settings.AddAsync(clinic);
        await context.SaveChangesAsync();

        var query = new ValidateJoinCodeQuery("EXPIRED2026");
        var result = await handler.Handle(query, CancellationToken.None);

        result.IsValid.Should().BeFalse();
        result.StatusCode.Should().Be(410);
        result.ErrorMessage.Should().Contain("expired");
    }
}
