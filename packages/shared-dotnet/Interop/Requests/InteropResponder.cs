using System.Security.Cryptography;
using System.Text;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Interop.Requests;

/// <summary>
/// Answers one request type. The SDK enqueues the returned payload as the reply, addressed to the request's
/// <c>From</c>, with the request's <c>CorrelationId</c>, and saves it together with whatever the handler changed
/// on the service's DbContext: leave those changes tracked rather than calling <c>SaveChanges</c> yourself, and
/// the effect and the reply commit atomically. Throw to have the hub redeliver the request (the caller times
/// out meanwhile); to report a business failure return it in the response payload (a status code, for example).
/// Authorise the sender (<see cref="InteropMessageContext.From"/>) inside the handler: the SDK does not.
/// </summary>
public interface IInteropResponder<in TRequest, TResponse>
{
    Task<TResponse> RespondAsync(TRequest request, InteropMessageContext context, CancellationToken ct);
}

internal static class InteropResponder
{
    /// <summary>How long a reply stays deliverable on the hub when the responder does not say otherwise.</summary>
    public static readonly TimeSpan DefaultReplyTtl = TimeSpan.FromMinutes(5);

    public static async Task RunAsync<TRequest, TResponse, THandler>(
        IServiceProvider sp,
        InteropEnvelope request,
        string replyType,
        TimeSpan replyTtl,
        CancellationToken ct)
        where THandler : class, IInteropResponder<TRequest, TResponse>
    {
        var db = sp.GetRequiredService<IInteropDbContext>();

        // The reply id is derived from the request id: a redelivered request finds its reply already queued
        // (so the handler is not run twice) and, were it sent twice, the hub de-duplicates it.
        var replyId = ReplyId(request.MessageId, replyType);
        if (await db.InteropOutbox.AsNoTracking().AnyAsync(x => x.MessageId == replyId, ct))
            return;

        var handler = sp.GetRequiredService<THandler>();
        var response = await handler.RespondAsync(request.GetPayload<TRequest>(), new InteropMessageContext(request), ct);

        // The responder is whoever the request was addressed to; the reply goes back to whoever signed the request.
        var reply = InteropEnvelope.Create(replyType, request.To, request.From, request.CorrelationId, response, ttl: replyTtl)
            with { MessageId = replyId };
        sp.GetRequiredService<IInteropPublisher>().Enqueue(reply);
        await db.SaveChangesAsync(ct);

        sp.GetRequiredService<InteropRelayService>().Signal();
    }

    internal static Guid ReplyId(Guid requestMessageId, string replyType)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{requestMessageId:N}:{replyType}"));
        return new Guid(hash.AsSpan(0, 16));
    }
}
