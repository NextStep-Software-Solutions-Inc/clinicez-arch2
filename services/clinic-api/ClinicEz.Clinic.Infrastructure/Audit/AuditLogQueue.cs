namespace ClinicEz.Clinic.Infrastructure.Audit;

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;

public sealed class AuditLogQueue : IAuditLogQueue
{
    public const int DefaultCapacity = 10000;

    private readonly Channel<AuditLogMessage> _channel;
    private readonly int _capacity;

    public AuditLogQueue() : this(DefaultCapacity)
    {
    }

    public AuditLogQueue(int capacity)
    {
        _capacity = capacity > 0 ? capacity : DefaultCapacity;
        var options = new BoundedChannelOptions(_capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        };
        _channel = Channel.CreateBounded<AuditLogMessage>(options);
    }

    public int Capacity => _capacity;
    public int Count => _channel.Reader.Count;

    public ValueTask EnqueueAsync(AuditLogMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        return _channel.Writer.WriteAsync(message, cancellationToken);
    }

    public bool TryEnqueue(AuditLogMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);
        return _channel.Writer.TryWrite(message);
    }

    public ValueTask<bool> WaitToReadAsync(CancellationToken cancellationToken = default)
    {
        return _channel.Reader.WaitToReadAsync(cancellationToken);
    }

    public bool TryDequeue([MaybeNullWhen(false)] out AuditLogMessage message)
    {
        return _channel.Reader.TryRead(out message);
    }

    public IAsyncEnumerable<AuditLogMessage> ReadAllAsync(CancellationToken cancellationToken = default)
    {
        return _channel.Reader.ReadAllAsync(cancellationToken);
    }
}
