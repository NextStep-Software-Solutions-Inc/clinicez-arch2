using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Responders;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public class YakapTransmittalResponderTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly ISender _sender;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IClinicScopeSetter _scope;
    private readonly ClinicRecipientResolver _recipientResolver;
    private readonly YakapTransmittalResponder _sut;

    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-1";

    public YakapTransmittalResponderTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var config = new ConfigurationBuilder().Build();
        _db = new ApplicationDbContext(options, config, Substitute.For<IClinicContext>());
        _db.Settings.Add(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Health Center"
        });
        _db.SaveChanges();

        _sender = Substitute.For<ISender>();
        _proxyClient = Substitute.For<IPhilHealthProxyClient>();
        _scope = Substitute.For<IClinicScopeSetter>();
        _recipientResolver = new ClinicRecipientResolver(_db, NullLogger<ClinicRecipientResolver>.Instance);

        _sut = new YakapTransmittalResponder(
            _sender,
            _proxyClient,
            _recipientResolver,
            _scope,
            NullLogger<YakapTransmittalResponder>.Instance);
    }

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    private InteropMessageContext CreateContext(Party? from = null, Party? to = null)
    {
        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = InteropTypes.YakapTransmittalRequested,
            From = from ?? Party.Portal,
            To = to ?? Party.ForFacility(TenantId, _clinicId.ToString(), FacilityType.Clinic)
        };
        return new InteropMessageContext(envelope);
    }

    [Fact]
    public async Task RespondAsync_WhenSenderIsNotControlPlane_Returns403Forbidden()
    {
        // Arrange
        var context = CreateContext(from: Party.ForPatient("p1"));
        var request = new YakapTransmittalRequestedPayload
        {
            Method = "GET",
            Path = "encounters/eligible"
        };

        // Act
        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        // Assert
        response.StatusCode.Should().Be(403);
        response.Body.Should().Contain("Forbidden");
    }

    [Fact]
    public async Task RespondAsync_WhenClinicNotFound_Returns404NotFound()
    {
        // Arrange
        var unhostedTo = Party.ForFacility(TenantId, Guid.NewGuid().ToString(), FacilityType.Clinic);
        var context = CreateContext(to: unhostedTo);
        var request = new YakapTransmittalRequestedPayload
        {
            Method = "GET",
            Path = "encounters/eligible"
        };

        // Act
        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        // Assert
        response.StatusCode.Should().Be(404);
        response.Body.Should().Contain("not found");
    }

    [Fact]
    public async Task RespondAsync_GetEligibleEncounters_EntersScopeAndReturnsSuccess()
    {
        // Arrange
        var branchId = Guid.NewGuid();
        var context = CreateContext();
        var request = new YakapTransmittalRequestedPayload
        {
            Method = "GET",
            Path = "encounters/eligible",
            Query = $"branchId={branchId}&reportTagging=2"
        };

        var expectedDto = new List<EligibleYakapEncounterDto>();

        _sender.Send(Arg.Any<GetEligibleYakapEncountersQuery>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<List<EligibleYakapEncounterDto>>.Success(expectedDto));

        // Act
        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        // Assert
        response.StatusCode.Should().Be(200);
        _scope.Received(1).Enter(TenantId, _clinicId, branchId);
    }

    [Fact]
    public async Task RespondAsync_GetTransmittals_ReturnsSuccessDeprecated()
    {
        // Arrange
        var context = CreateContext();
        var request = new YakapTransmittalRequestedPayload
        {
            Method = "GET",
            Path = "transmittals"
        };

        // Act
        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        // Assert
        response.StatusCode.Should().Be(200);
    }

    [Fact]
    public async Task RespondAsync_UnknownPath_Returns404()
    {
        // Arrange
        var context = CreateContext();
        var request = new YakapTransmittalRequestedPayload
        {
            Method = "GET",
            Path = "nonexistent/endpoint"
        };

        // Act
        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        // Assert
        response.StatusCode.Should().Be(404);
        response.Body.Should().Contain("NOT_FOUND");
    }
}
