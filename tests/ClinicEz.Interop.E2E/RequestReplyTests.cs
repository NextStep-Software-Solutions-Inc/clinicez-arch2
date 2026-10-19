using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Request/reply over the hub (the replacement for direct service-to-service HTTP): the caller awaits the reply that carries its
/// correlation id, and gets an <see cref="InteropRequestTimeoutException"/> when nobody answers.
/// </summary>
public class RequestReplyTests
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(20);

    [Fact]
    public async Task Request_ToAPharmacyThatIsDown_TimesOut_AfterTheHubAcceptedIt()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var pharmacy = await cell.ProvisionAsync(Fac.Pharmacy("tenant-a"));
        var requests = cell.Clinic.Provider.GetRequiredService<IInteropRequestClient>();

        var call = requests.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
            InteropTypes.GamotLookupRequested,
            InteropTypes.GamotLookupResponded,
            clinic.Party,
            pharmacy.Party,
            new GamotLookupRequestedPayload { Path = "drugs/search", Query = "q=paracetamol" },
            timeout: TimeSpan.FromSeconds(1));

        var timedOut = () => Cell.PumpUntilAsync([cell.Clinic], call, Limit);

        var error = (await timedOut.Should().ThrowAsync<InteropRequestTimeoutException>()).Which;
        error.RequestType.Should().Be(InteropTypes.GamotLookupRequested);
        var sent = (await cell.Clinic.SentAsync()).Single(m => m.Type == InteropTypes.GamotLookupRequested);
        sent.Dispatched.Should().BeTrue("the request reached the hub and waits in the pharmacy's mailbox");
        sent.Envelope.CorrelationId.Should().Be(error.CorrelationId);
        (await cell.Hub.DbAsync(db => db.Messages.CountAsync(m => m.Type == InteropTypes.GamotLookupRequested))).Should().Be(1);
    }
}
