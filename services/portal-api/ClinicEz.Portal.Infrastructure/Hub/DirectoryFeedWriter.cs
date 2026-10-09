using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Infrastructure.Hub;

/// <summary>
/// Collects <c>directory.*</c> messages for the hub and stages them in the transactional outbox of the caller's
/// <c>SaveChanges</c>. Cells go before facilities and facilities before links, and the messages are stamped so they
/// are shipped BEFORE anything the same unit of work already queued (a facility must be in the directory before
/// the hub is asked to route its licence to it).
/// </summary>
internal sealed class DirectoryFeedWriter(ApplicationDbContext db)
{
    private static readonly TimeSpan Step = TimeSpan.FromTicks(10); // 1 microsecond: the precision Postgres stores

    private readonly List<InteropEnvelope> _cells = [];
    private readonly List<InteropEnvelope> _facilities = [];
    private readonly List<InteropEnvelope> _links = [];
    private readonly HashSet<string> _cellIds = [];
    private readonly Dictionary<Guid, InteropEnvelope> _linksById = [];

    public int Count => _cells.Count + _facilities.Count + _links.Count;

    public void Cell(DirectoryCellUpsertedPayload cell)
    {
        if (!_cellIds.Add(cell.CellId)) return;
        _cells.Add(Create(InteropTypes.DirectoryCellUpserted, Guid.NewGuid(), cell));
    }

    public void Facility(DirectoryFacilityUpsertedPayload facility) =>
        _facilities.Add(Create(InteropTypes.DirectoryFacilityUpserted, Guid.Parse(facility.FacilityId), facility));

    /// <summary>A link staged twice in one batch is sent once, with the last status.</summary>
    public void Link(DirectoryLinkUpsertedPayload link)
    {
        var envelope = Create(InteropTypes.DirectoryLinkUpserted, link.LinkId, link);
        if (_linksById.TryGetValue(link.LinkId, out var previous)) _links.Remove(previous);
        _linksById[link.LinkId] = envelope;
        _links.Add(envelope);
    }

    /// <summary>Writes the collected messages to the outbox (not saved: the caller's <c>SaveChanges</c> commits them).</summary>
    public int Flush()
    {
        var ordered = _cells.Concat(_facilities).Concat(_links).ToList();
        if (ordered.Count == 0) return 0;

        var alreadyStaged = db.ChangeTracker.Entries<InteropOutboxMessage>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity.CreatedAtUtc)
            .ToList();
        var earliest = alreadyStaged.Count == 0 ? DateTime.UtcNow : alreadyStaged.Min();

        var publisher = new InteropPublisher(db);
        foreach (var envelope in ordered) publisher.Enqueue(envelope);

        var staged = db.InteropOutbox.Local.ToDictionary(m => m.MessageId);
        for (var i = 0; i < ordered.Count; i++)
        {
            staged[ordered[i].MessageId].CreatedAtUtc = earliest - Step * (ordered.Count - i);
        }

        return ordered.Count;
    }

    private static InteropEnvelope Create<T>(string type, Guid correlationId, T payload) =>
        InteropEnvelope.Create(type, Party.Portal, Party.Hub, correlationId, payload);
}
