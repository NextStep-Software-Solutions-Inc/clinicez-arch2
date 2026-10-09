using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// The PhilHealth proxy is a platform service with a hub client of its own, and PhilHealth credentials travel only between it and
/// the portal. The real hub decides who may send what to whom; nothing here relies on a receiving service being polite.
/// </summary>
public class PlatformServiceRulesTests
{
    private const string Proxy = InteropServices.Philhealth;

    [Fact]
    public async Task AFacility_MayAskTheProxy_AndOnlyTheProxyReceivesIt()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var request = Request(clinic);
        (await SendAsync(cell, InteropServices.Clinic, request)).Status.Should().Be(SendResult.Accepted);

        var pulled = await cell.Hub.NewSdk(Proxy).PullAsync(Proxy, 10, 0, CancellationToken.None);
        var message = pulled.Should().ContainSingle().Subject;
        message.Envelope.From.Should().BeEquivalentTo(clinic.Party, "the proxy learns the tenant from the verified sender, not from the payload");
        message.Envelope.Type.Should().Be(InteropTypes.PhilHealthRequest);
        (await cell.Hub.DbAsync(db => db.Messages.Where(m => m.Type == InteropTypes.PhilHealthRequest).Select(m => m.Mailbox).ToListAsync()))
            .Should().OnlyContain(mailbox => mailbox.EndsWith(":" + Proxy));
    }

    [Fact]
    public async Task AFacility_CannotUseTheProxyForAnythingButPhilHealthRequests()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var forbidden = new[]
        {
            Envelope(InteropTypes.LabOrderIssued, clinic.Party, Party.PhilHealth, new { }),
            Envelope(InteropTypes.PhilHealthConfigRequested, clinic.Party, Party.Portal, new PhilHealthConfigRequestedPayload { TenantId = "tenant-a" }),
            Envelope(InteropTypes.PhilHealthConfigResponded, clinic.Party, Party.PhilHealth, new PhilHealthConfigRespondedPayload { Found = true }),
            Envelope(InteropTypes.PhilHealthConfigUpsertResponded, clinic.Party, Party.PhilHealth, new PhilHealthConfigUpsertRespondedPayload { Succeeded = true }),
            Envelope(InteropTypes.PhilHealthResponse, Party.PhilHealth, clinic.Party, new PhilHealthResponsePayload { StatusCode = 200 })
        };

        foreach (var envelope in forbidden)
        {
            var result = await SendAsync(cell, InteropServices.Clinic, envelope);
            result.Status.Should().Be(SendResult.Rejected, $"{envelope.Type} from a facility to {envelope.To.Service ?? envelope.To.Kind.ToString()}: {result.Reason}");
        }

        (await cell.Hub.NewSdk(Proxy).PullAsync(Proxy, 10, 0, CancellationToken.None)).Should().BeEmpty("nothing reached the proxy's mailbox");
        (await cell.Hub.DbAsync(db => db.Messages.CountAsync(m => m.Type.StartsWith("philhealth.")))).Should().Be(0);
    }

    [Fact]
    public async Task OnlyTheProxy_MayAnswerAFacility_AndOnlyWithPhilHealthTypes()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-a"));

        var answer = Envelope(InteropTypes.PhilHealthResponse, Party.PhilHealth, clinic.Party, new PhilHealthResponsePayload { StatusCode = 200, Body = "{}" });
        (await SendAsync(cell, Proxy, answer)).Status.Should().Be(SendResult.Accepted);

        var delivered = await cell.Hub.DbAsync(db => db.Messages.Where(m => m.Type == InteropTypes.PhilHealthResponse).Select(m => m.Mailbox).ToListAsync());
        delivered.Should().ContainSingle().Which.Should().EndWith(":" + InteropServices.Clinic);

        var forbidden = new[]
        {
            Envelope(InteropTypes.PhilHealthResponse, Party.PhilHealth, Party.Portal, new PhilHealthResponsePayload()),
            Envelope(InteropTypes.LabOrderStatusChanged, Party.PhilHealth, lab.Party, new { }),
            Envelope(InteropTypes.PhilHealthRequest, Party.PhilHealth, clinic.Party, Request(clinic).Payload)
        };
        foreach (var envelope in forbidden)
        {
            var result = await SendAsync(cell, Proxy, envelope);
            result.Status.Should().Be(SendResult.Rejected, $"{envelope.Type} from the proxy to {envelope.To.Service ?? envelope.To.Kind.ToString()}: {result.Reason}");
        }
    }

    [Fact]
    public async Task Credentials_TravelOnlyBetweenTheProxyAndThePortal()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-a"));
        var config = new PhilHealthConfigPayload { TenantId = "tenant-a", Username = "clinic-user", Password = "s3cret", CipherKey = "k3y", IsActive = true };

        var ask = Envelope(InteropTypes.PhilHealthConfigRequested, Party.PhilHealth, Party.Portal, new PhilHealthConfigRequestedPayload { TenantId = "tenant-a" });
        (await SendAsync(cell, Proxy, ask)).Status.Should().Be(SendResult.Accepted);
        var portalInbox = await cell.Hub.NewSdk(InteropServices.Portal).PullAsync(InteropServices.Portal, 10, 0, CancellationToken.None);
        portalInbox.Select(m => m.Envelope.Type).Should().Contain(InteropTypes.PhilHealthConfigRequested);

        var reply = Envelope(InteropTypes.PhilHealthConfigResponded, Party.Portal, Party.PhilHealth, new PhilHealthConfigRespondedPayload { Found = true, Config = config }) with { CorrelationId = ask.CorrelationId };
        (await SendAsync(cell, InteropServices.Portal, reply)).Status.Should().Be(SendResult.Accepted);
        var upsert = Envelope(InteropTypes.PhilHealthConfigUpsertRequested, Party.PhilHealth, Party.Portal, config);
        (await SendAsync(cell, Proxy, upsert)).Status.Should().Be(SendResult.Accepted);
        var upserted = Envelope(InteropTypes.PhilHealthConfigUpsertResponded, Party.Portal, Party.PhilHealth, new PhilHealthConfigUpsertRespondedPayload { Succeeded = true }) with { CorrelationId = upsert.CorrelationId };
        (await SendAsync(cell, InteropServices.Portal, upserted)).Status.Should().Be(SendResult.Accepted);

        // Neither the portal nor the proxy can hand the credentials to a facility.
        foreach (var (sender, leak) in new[]
        {
            (InteropServices.Portal, Envelope(InteropTypes.PhilHealthConfigResponded, Party.Portal, clinic.Party, new PhilHealthConfigRespondedPayload { Found = true, Config = config })),
            (Proxy, Envelope(InteropTypes.PhilHealthConfigResponded, Party.PhilHealth, lab.Party, new PhilHealthConfigRespondedPayload { Found = true, Config = config }))
        })
        {
            var result = await SendAsync(cell, sender, leak);
            result.Status.Should().Be(SendResult.Rejected, result.Reason);
        }

        var carriers = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.PhilHealthConfigResponded || m.Type == InteropTypes.PhilHealthConfigUpsertRequested)
            .Select(m => new { m.Type, m.Mailbox }).ToListAsync());
        carriers.Should().OnlyContain(m => m.Mailbox.EndsWith(m.Type == InteropTypes.PhilHealthConfigResponded ? ":" + Proxy : ":" + InteropServices.Portal));
        foreach (var facilityService in new[] { InteropServices.Clinic, InteropServices.Laboratory, InteropServices.Pharmacy, InteropServices.Patient })
        {
            (await cell.Hub.DbAsync(db => db.Messages.CountAsync(m => m.Mailbox.EndsWith(":" + facilityService) && m.Type.StartsWith("philhealth.config"))))
                .Should().Be(0, $"{facilityService} never receives credentials");
        }
    }

    private static InteropEnvelope Request(Fac facility) =>
        Envelope(
            InteropTypes.PhilHealthRequest,
            facility.Party,
            Party.PhilHealth,
            new PhilHealthRequestPayload { Operation = PhilHealthOperations.YakapPinValidate, Argument = "12-345678901-2" });

    private static InteropEnvelope Envelope<T>(string type, Party from, Party to, T payload) =>
        InteropEnvelope.Create(type, from, to, Guid.NewGuid(), payload);

    private static async Task<SendResult> SendAsync(TestCell cell, string service, InteropEnvelope envelope)
    {
        var results = await cell.Hub.NewSdk(service).SendAsync([envelope], CancellationToken.None);
        return results.Should().ContainSingle().Subject;
    }
}
