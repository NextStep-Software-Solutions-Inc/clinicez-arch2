using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// An <see cref="IInteropRequestClient"/> that answers from a function instead of the hub and records every request, so
/// tests can assert what was asked, of whom, and how the caller reacts to a reply, a timeout or silence.
/// </summary>
internal sealed class StubInteropRequestClient : IInteropRequestClient
{
    public sealed record Call(string RequestType, string ReplyType, Party From, Party To, object Payload, TimeSpan? Timeout);

    private readonly Func<Call, object> _reply;

    public StubInteropRequestClient(Func<Call, object> reply) => _reply = reply;

    public List<Call> Calls { get; } = [];

    /// <summary>When set, every request throws it (for example an <see cref="InteropRequestTimeoutException"/>).</summary>
    public Exception? Failure { get; set; }

    public Task<TResponse> RequestAsync<TRequest, TResponse>(
        string requestType,
        string replyType,
        Party from,
        Party to,
        TRequest payload,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        var call = new Call(requestType, replyType, from, to, payload!, timeout);
        Calls.Add(call);
        if (Failure is not null) throw Failure;
        return Task.FromResult((TResponse)_reply(call));
    }
}
