using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Security.Turnstile;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class TurnstileSettingsCommandTests
{
    [Fact]
    public async Task UpdateClinicSettings_PersistsTurnstileToggleAndSiteKey()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "test-tenant-1";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            TurnstileEnabled = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        db.ClinicSettings.Add(existing);
        await db.SaveChangesAsync();

        var resolver = new TurnstileSettingResolver(new ConfigurationBuilder().Build());
        var handler = new UpdateClinicSettingsCommandHandler(repo, clinicContext, unitOfWork, null, resolver);

        var command = new UpdateClinicSettingsCommand(
            TurnstileEnabled: true,
            TurnstileSiteKey: "0x4AAAAAAATurnstileCustomKey");

        var updated = await handler.Handle(command, CancellationToken.None);

        updated.TurnstileEnabled.Should().BeTrue();
        updated.TurnstileSiteKey.Should().Be("0x4AAAAAAATurnstileCustomKey");
        updated.IsTurnstileOverriddenByEnv.Should().BeFalse();
        updated.TurnstileEnvOverrideValue.Should().BeNull();

        // Verify in DB
        existing.TurnstileEnabled.Should().BeTrue();
        existing.TurnstileSiteKey.Should().Be("0x4AAAAAAATurnstileCustomKey");
    }

    [Fact]
    public async Task GetClinicSettings_WhenEnvironmentOverrideActive_ReportsOverrideMetadata()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "test-tenant-1";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        // Facility db setting has TurnstileEnabled = false
        var existing = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            TurnstileEnabled = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        db.ClinicSettings.Add(existing);
        await db.SaveChangesAsync();

        // Environment overrides with TURNSTILE_ENABLED = true
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["TURNSTILE_ENABLED"] = "true"
            })
            .Build();

        var resolver = new TurnstileSettingResolver(config);
        var handler = new GetClinicSettingsQueryHandler(repo, clinicContext, unitOfWork, resolver);

        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Effective setting is overridden to true
        result.TurnstileEnabled.Should().BeTrue();
        result.IsTurnstileOverriddenByEnv.Should().BeTrue();
        result.TurnstileEnvOverrideValue.Should().BeTrue();
    }
}
