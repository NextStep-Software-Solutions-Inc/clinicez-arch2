using System.Text.Json;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Gamot.Commands;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Application.Features.Gamot.Queries;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary><c>gamot.lookup.requested</c>: the clinic's GAMOT calls answered over the hub, in process, for its own tenant only.</summary>
public class PharmacyGamotLookupResponderTests
{
    private const string Tenant = "tenant-gamot";
    private static readonly Guid PharmacyGuid = new("bbbbbbbb-0000-0000-0000-000000000002");

    private static Party PharmacyParty => Party.ForFacility(Tenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);
    private static Party ClinicParty => Party.ForFacility(Tenant, Guid.NewGuid().ToString(), FacilityType.Clinic);
    private static Party ForeignClinicParty => Party.ForFacility("another-tenant", Guid.NewGuid().ToString(), FacilityType.Clinic);

    private sealed class Fixture
    {
        public required ISender Sender { get; init; }
        public required TestPharmacyScope Scope { get; init; }
        public required GamotLookupResponder Responder { get; init; }
    }

    private static async Task<Fixture> CreateFixtureAsync(bool provisioned = true)
    {
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_GamotDb_{Guid.NewGuid()}", scope);
        var sieve = Substitute.For<ISieveProcessor>();

        if (provisioned)
        {
            db.PharmacySettings.Add(new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = Tenant,
                PharmacyId = PharmacyGuid,
                PharmacyName = "Rizal Community Pharmacy",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            await db.SaveChangesAsync();
        }

        var sender = Substitute.For<ISender>();
        return new Fixture
        {
            Sender = sender,
            Scope = scope,
            Responder = new GamotLookupResponder(
                sender,
                new Repository<PharmacySettings>(db, sieve),
                scope,
                NullLogger<GamotLookupResponder>.Instance)
        };
    }

    private static Task<GamotLookupRespondedPayload> AskAsync(
        Fixture f,
        string method,
        string path,
        string? query = null,
        string? body = null,
        Party? from = null,
        Party? to = null) =>
        f.Responder.RespondAsync(
            new GamotLookupRequestedPayload { Method = method, Path = path, Query = query, Body = body },
            new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.GamotLookupRequested, from ?? ClinicParty, to ?? PharmacyParty, Guid.NewGuid(), new object())),
            CancellationToken.None);

    private static JsonElement Parse(GamotLookupRespondedPayload reply) => JsonDocument.Parse(reply.Body!).RootElement;

    [Fact]
    public async Task Lookup_FromAClinicOfTheSameTenant_RunsTheGamotQuery_AndRepliesWithTheEndpointShape()
    {
        var f = await CreateFixtureAsync();
        GetGamotLedgerByPinQuery? seen = null;
        f.Sender.Send(Arg.Do<GetGamotLedgerByPinQuery>(q => seen = q), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<GamotBeneficiaryLedgerDto>.Success(null!, "ok"));

        var reply = await AskAsync(f, "GET", "/ledger/12-345678901-2", "year=2026");

        reply.StatusCode.Should().Be(200);
        reply.ContentType.Should().Be("application/json");
        var body = Parse(reply);
        body.GetProperty("succeeded").GetBoolean().Should().BeTrue();
        body.GetProperty("message").GetString().Should().Be("ok");
        seen.Should().Be(new GetGamotLedgerByPinQuery("12-345678901-2", "2026"));
        f.Scope.TenantId.Should().Be(Tenant, "the lookup runs in the recipient pharmacy's scope");
        f.Scope.PharmacyId.Should().Be(PharmacyGuid);
    }

    [Fact]
    public async Task Lookup_ThroughTheHub_ServesTheRealFormulary_AndRepliesToTheClinicOnce()
    {
        var dbName = $"Pharmacy_GamotE2E_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Pharmacy,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "public"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<PharmacyContext>();
        services.AddScoped<IPharmacyContext>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddScoped<IPharmacyScopeSetter>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton(Substitute.For<ISieveProcessor>());
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddSingleton<IGamotFormularyService, GamotFormularyService>();
        services.AddMediatR(c => c.RegisterServicesFromAssemblyContaining<GamotLookupResponder>());
        services.AddInterop<ApplicationDbContext>(config, h => h
            .Respond<GamotLookupRequestedPayload, GamotLookupRespondedPayload, GamotLookupResponder>(
                InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded));
        await using var provider = services.BuildServiceProvider();

        using (var seedScope = provider.CreateScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            seedDb.PharmacySettings.Add(new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = Tenant,
                PharmacyId = PharmacyGuid,
                PharmacyName = "Rizal Community Pharmacy",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            await seedDb.SaveChangesAsync();
        }

        var clinic = ClinicParty;
        var correlation = Guid.NewGuid();
        var envelope = InteropEnvelope.Create(
            InteropTypes.GamotLookupRequested,
            clinic,
            PharmacyParty,
            correlation,
            new GamotLookupRequestedPayload { Method = "GET", Path = "formulary", Query = "search=paracetamol" });

        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var replies = (await db.InteropOutbox.AsNoTracking().Where(m => m.Type == InteropTypes.GamotLookupResponded).ToListAsync())
            .Select(m => InteropEnvelope.FromJson(m.EnvelopeJson))
            .ToList();
        var envelopeReply = replies.Should().ContainSingle("a redelivered request must not be answered twice").Subject;
        envelopeReply.To.Should().Be(clinic);
        envelopeReply.CorrelationId.Should().Be(correlation);

        var payload = envelopeReply.GetPayload<GamotLookupRespondedPayload>();
        payload.StatusCode.Should().Be(200);
        var body = Parse(payload);
        body.GetProperty("succeeded").GetBoolean().Should().BeTrue();
        body.GetProperty("data").EnumerateArray().Select(e => e.GetProperty("genericName").GetString())
            .Should().Contain("Paracetamol");
    }

    [Fact]
    public async Task Lookup_FromAnotherTenant_Is403_AndTouchesNoData()
    {
        var f = await CreateFixtureAsync();

        var reply = await AskAsync(f, "GET", "ledger/12-345678901-2", from: ForeignClinicParty);

        reply.StatusCode.Should().Be(403);
        Parse(reply).GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("FORBIDDEN");
        f.Sender.ReceivedCalls().Should().BeEmpty();
        f.Scope.PharmacyId.Should().Be(Guid.Empty, "no pharmacy scope is entered for a refused sender");
    }

    [Theory]
    [InlineData("hub")]
    [InlineData("philhealth")]
    public async Task Lookup_FromAControlPlaneParty_Is403(string service)
    {
        var f = await CreateFixtureAsync();
        var from = service == "hub" ? Party.Hub : Party.PhilHealth;

        var reply = await AskAsync(f, "GET", "formulary", from: from);

        reply.StatusCode.Should().Be(403);
        f.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("GET", "admin/secret")]
    [InlineData("GET", "upsc/forge")]
    [InlineData("GET", "")]
    [InlineData("POST", "transactions/not-a-guid/reverse")]
    public async Task Lookup_OfAnUnknownPath_Is404(string method, string path)
    {
        var f = await CreateFixtureAsync();

        var reply = await AskAsync(f, method, path, body: "{}");

        reply.StatusCode.Should().Be(404);
        Parse(reply).GetProperty("succeeded").GetBoolean().Should().BeFalse();
        f.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("POST", "formulary")]
    [InlineData("GET", "dispense")]
    [InlineData("DELETE", "formulary")]
    [InlineData("PUT", "dispense")]
    public async Task Lookup_WithTheWrongMethod_Is405(string method, string path)
    {
        var f = await CreateFixtureAsync();

        var reply = await AskAsync(f, method, path, body: "{}");

        reply.StatusCode.Should().Be(405);
        f.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task Lookup_AddressedToAnUnprovisionedPharmacy_Is404_AndRunsNothing()
    {
        var f = await CreateFixtureAsync(provisioned: false);

        var reply = await AskAsync(f, "GET", "formulary");

        reply.StatusCode.Should().Be(404);
        f.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task Lookup_PostRoutes_PassTheJsonBodyToTheMatchingCommand()
    {
        var f = await CreateFixtureAsync();
        var orderId = Guid.NewGuid();
        ReverseGamotTransactionCommand? seen = null;
        f.Sender.Send(Arg.Do<ReverseGamotTransactionCommand>(c => seen = c), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<GamotLedgerTransactionDto>.Success(null!));

        var reply = await AskAsync(
            f,
            "POST",
            $"transactions/{orderId}/reverse",
            body: """{"reason":"Wrong patient","reversedBy":"RPh. Cruz"}""");

        reply.StatusCode.Should().Be(200);
        seen.Should().Be(new ReverseGamotTransactionCommand(orderId, "Wrong patient", "RPh. Cruz"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("{not json")]
    public async Task Lookup_PostWithAMissingOrBrokenBody_Is400(string? body)
    {
        var f = await CreateFixtureAsync();

        var reply = await AskAsync(f, "POST", "upsc/validate", body: body);

        reply.StatusCode.Should().Be(400);
        Parse(reply).GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("BAD_REQUEST");
        f.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task Lookup_WhenTheHandlerRejectsTheRequest_RepliesWithTheUsualStatusAndErrors()
    {
        var f = await CreateFixtureAsync();
        f.Sender.Send(Arg.Any<GetGamotLedgerByPinQuery>(), Arg.Any<CancellationToken>())
            .Returns<ApiResponse<GamotBeneficiaryLedgerDto>>(_ => throw new ValidationException(
                "One or more validation errors occurred.",
                new Dictionary<string, string[]> { ["PhilHealthPin"] = ["PIN is not valid."] }));

        var reply = await AskAsync(f, "GET", "ledger/bad-pin");

        reply.StatusCode.Should().Be(400);
        var error = Parse(reply).GetProperty("errors")[0];
        error.GetProperty("field").GetString().Should().Be("PhilHealthPin");
        error.GetProperty("code").GetString().Should().Be("VALIDATION_ERROR");
    }

    [Fact]
    public async Task Lookup_WhenTheHandlerFailsUnexpectedly_Is500_WithoutLeakingTheException()
    {
        var f = await CreateFixtureAsync();
        f.Sender.Send(Arg.Any<GetGamotFormularyQuery>(), Arg.Any<CancellationToken>())
            .Returns<ApiResponse<IReadOnlyList<GamotFormularyDto>>>(_ => throw new InvalidOperationException("db password is hunter2"));

        var reply = await AskAsync(f, "GET", "formulary");

        reply.StatusCode.Should().Be(500);
        reply.Body.Should().NotContain("hunter2");
        Parse(reply).GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("INTERNAL_ERROR");
    }
}
