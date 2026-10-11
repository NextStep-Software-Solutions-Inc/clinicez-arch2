using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Decides which clinic on this server an inbound message is addressed to. Handlers run without an HTTP request, so
/// the ambient clinic context is unscoped; the envelope destination is the only trustworthy tenant/facility scope.
/// A message addressed to a facility this server does not host is not ours to process.
/// </summary>
public sealed class ClinicRecipientResolver
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<ClinicRecipientResolver> _logger;

    public ClinicRecipientResolver(ApplicationDbContext db, ILogger<ClinicRecipientResolver> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>The addressed clinic's settings, or null (and a warning) when this server hosts no such clinic.</summary>
    public async Task<ClinicSettings?> ResolveAsync(InteropMessageContext context, CancellationToken ct)
    {
        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var clinicId))
        {
            _logger.LogWarning("Ignoring {Type} message {MessageId}: destination {To} is not a clinic facility.",
                context.Type, context.MessageId, to.Address);
            return null;
        }

        var tenantId = to.TenantId.Trim().ToLower();
        var clinic = await _db.ClinicSettings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == clinicId && s.TenantId.ToLower() == tenantId, ct);

        if (clinic == null)
        {
            _logger.LogWarning("Ignoring {Type} message {MessageId}: this server does not host {To}.",
                context.Type, context.MessageId, to.Address);
        }

        return clinic;
    }
}
