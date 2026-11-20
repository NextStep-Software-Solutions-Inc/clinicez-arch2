using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
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

public sealed class YakapSubmissionResponderTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly ISender _sender;
    private readonly IClinicScopeSetter _scope;
    private readonly ClinicRecipientResolver _recipientResolver;
    private readonly YakapSubmissionResponder _sut;

    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-1";

    public YakapSubmissionResponderTests()
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
        _scope = Substitute.For<IClinicScopeSetter>();
        _recipientResolver = new ClinicRecipientResolver(_db, NullLogger<ClinicRecipientResolver>.Instance);

        _sut = new YakapSubmissionResponder(
            _sender,
            _recipientResolver,
            _scope,
            NullLogger<YakapSubmissionResponder>.Instance);
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
            Type = InteropTypes.YakapSubmissionRequested,
            From = from ?? Party.Portal,
            To = to ?? Party.ForFacility(TenantId, _clinicId.ToString(), FacilityType.Clinic)
        };
        return new InteropMessageContext(envelope);
    }

    [Fact]
    public async Task RespondAsync_WhenSenderIsNotControlPlane_Returns403Forbidden()
    {
        var context = CreateContext(from: Party.ForPatient("p1"));
        var request = new YakapSubmissionRequestedPayload { Method = "GET", Path = "submissions/summary" };

        var response = await _sut.RespondAsync(request, context, CancellationToken.None);

        response.StatusCode.Should().Be(403);
        response.Body.Should().Contain("FORBIDDEN");
    }

    [Fact]
    public async Task RespondAsync_GetSubmissionsSummary_ReturnsZeroPhiSummaryFromMediatR()
    {
        var branchId = Guid.NewGuid();
        var summaryDto = new PortalYakapBranchSummaryDto
        {
            BranchId = branchId,
            AccreditationNo = "H10000001",
            EmpaneledCount = 4,
            SelectedCount = 6,
            AcceptedUploadsCount = 3,
            PendingPollingCount = 1,
            RejectedOrFailedCount = 0
        };

        _sender.Send(Arg.Any<GetYakapSubmissionsSummaryQuery>(), Arg.Any<CancellationToken>())
            .Returns(summaryDto);

        var response = await _sut.RespondAsync(
            new YakapSubmissionRequestedPayload { Method = "GET", Path = "submissions/summary", Query = $"branchId={branchId}" },
            CreateContext(),
            CancellationToken.None);

        response.StatusCode.Should().Be(200);
        var api = JsonSerializer.Deserialize<ApiResponse<PortalYakapBranchSummaryDto>>(response.Body!, InteropJson.Options);
        api!.Succeeded.Should().BeTrue();
        api.Data!.EmpaneledCount.Should().Be(4);
        api.Data.AcceptedUploadsCount.Should().Be(3);
    }

    [Fact]
    public async Task RespondAsync_PostPollAndSyncMasterlist_RoutesToPcapiV2Handlers()
    {
        var subId = Guid.NewGuid();
        _sender.Send(Arg.Is<PollYakapSubmissionStatusCommand>(c => c.SubmissionId == subId), Arg.Any<CancellationToken>())
            .Returns(new PortalYakapSubmissionDto
            {
                Id = subId,
                PatientCode = "PAT-001",
                SubmissionType = "Fpe",
                LocalTransactionNo = "PH100000012026112000001",
                ProcessingStatus = "Accepted"
            });

        var pollReply = await _sut.RespondAsync(
            new YakapSubmissionRequestedPayload { Method = "POST", Path = $"submissions/{subId}/poll" },
            CreateContext(),
            CancellationToken.None);

        pollReply.StatusCode.Should().Be(200);
        pollReply.Body.Should().Contain("PAT-001");
        pollReply.Body.Should().Contain("Accepted");

        _sender.Send(Arg.Any<SyncYakapMasterlistCommand>(), Arg.Any<CancellationToken>())
            .Returns(new PortalYakapMasterlistSyncResultDto
            {
                Success = true,
                TotalActiveCount = 12,
                RecordsUpdated = 5,
                SyncedAtUtc = DateTime.UtcNow
            });

        var syncReply = await _sut.RespondAsync(
            new YakapSubmissionRequestedPayload { Method = "POST", Path = "masterlist/sync" },
            CreateContext(),
            CancellationToken.None);

        syncReply.StatusCode.Should().Be(200);
        syncReply.Body.Should().Contain("12");
    }
}
