using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Answers <see cref="InteropTypes.PatientIdentityDirectoryRequested"/> from the control plane (<see cref="Party.Portal"/>),
/// returning strictly non-clinical patient account identity metadata and aggregate Clerk/unlinked KPIs.
/// </summary>
public sealed class PatientIdentityDirectoryResponder(
    ApplicationDbContext db,
    ILogger<PatientIdentityDirectoryResponder> logger)
    : IInteropResponder<PatientIdentityDirectoryRequestedPayload, PatientIdentityDirectoryRespondedPayload>
{
    public const string ClerkEmailReclaimActor = "System:ClerkEmailReclaim";

    public async Task<PatientIdentityDirectoryRespondedPayload> RespondAsync(
        PatientIdentityDirectoryRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        if (!IsPortalControlPlane(context.From))
        {
            logger.LogWarning(
                "Rejected patient.identity.directory.requested {MessageId} from unauthorized sender {Sender}.",
                context.MessageId,
                context.From.Address);

            return new PatientIdentityDirectoryRespondedPayload
            {
                Succeeded = false,
                ErrorCode = "UNAUTHORIZED",
                Error = "Only the platform control plane may query the patient identity directory."
            };
        }

        var limit = Math.Clamp(request.Limit <= 0 ? 25 : request.Limit, 1, 100);
        var offset = Math.Max(0, request.Offset);
        var statusFilter = NormalizeStatusFilter(request.StatusFilter);
        var search = string.IsNullOrWhiteSpace(request.Search)
            ? null
            : request.Search.Trim().ToLowerInvariant();

        var primaryPatients = db.Patients
            .AsNoTracking()
            .Where(p => p.ManagedByPatientId == null && !p.IsDeleted);

        // Identify duplicate non-empty emails across primary patient accounts (case-insensitive)
        var duplicateGroups = await primaryPatients
            .Where(p => p.Email != null && p.Email != "")
            .Select(p => p.Email!.Trim().ToLower())
            .GroupBy(e => e)
            .Where(g => g.Count() > 1)
            .Select(g => new { Email = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var dupEmailCounts = duplicateGroups.ToDictionary(x => x.Email, x => x.Count, StringComparer.Ordinal);
        var duplicateEmailList = dupEmailCounts.Keys.ToArray();

        var totalPrimary = await primaryPatients.LongCountAsync(ct);
        var clerkLinked = await primaryPatients.LongCountAsync(p => p.ClerkUserId != null && p.ClerkUserId != "", ct);
        var unlinked = await primaryPatients.LongCountAsync(p => p.ClerkUserId == null || p.ClerkUserId == "", ct);
        var reclaimed = await primaryPatients.LongCountAsync(
            p => p.ClerkUserId != null && p.ClerkUserId != "" && p.UpdatedBy == ClerkEmailReclaimActor, ct);

        var summary = new PatientIdentityDirectorySummaryPayload
        {
            TotalPrimaryPatients = totalPrimary,
            ClerkLinkedCount = clerkLinked,
            UnlinkedCount = unlinked,
            ReclaimedViaEmailCount = reclaimed,
            AmbiguousDuplicateEmailGroups = dupEmailCounts.Count,
            AmbiguousDuplicatePatientCount = dupEmailCounts.Values.Sum(v => (long)v)
        };

        var filtered = primaryPatients;

        if (search is not null)
        {
            filtered = filtered.Where(p =>
                p.ClinicEzId.ToLower().Contains(search) ||
                p.FirstName.ToLower().Contains(search) ||
                p.LastName.ToLower().Contains(search) ||
                (p.Email != null && p.Email.ToLower().Contains(search)) ||
                (p.ClerkUserId != null && p.ClerkUserId.ToLower().Contains(search)));
        }

        filtered = statusFilter switch
        {
            PatientIdentityFilter.ClerkLinked =>
                filtered.Where(p => p.ClerkUserId != null && p.ClerkUserId != ""),
            PatientIdentityFilter.Unlinked =>
                filtered.Where(p => p.ClerkUserId == null || p.ClerkUserId == ""),
            PatientIdentityFilter.Reclaimed =>
                filtered.Where(p => p.ClerkUserId != null && p.ClerkUserId != "" && p.UpdatedBy == ClerkEmailReclaimActor),
            PatientIdentityFilter.AmbiguousEmail =>
                duplicateEmailList.Length == 0
                    ? filtered.Where(_ => false)
                    : filtered.Where(p => p.Email != null && duplicateEmailList.Contains(p.Email.Trim().ToLower())),
            _ => filtered
        };

        var totalMatching = await filtered.LongCountAsync(ct);

        var pageRows = await filtered
            .OrderByDescending(p => p.UpdatedAt ?? p.CreatedAt)
            .ThenBy(p => p.Id)
            .Skip(offset)
            .Take(limit)
            .Select(p => new
            {
                p.Id,
                p.ClinicEzId,
                p.FirstName,
                p.LastName,
                p.Email,
                p.ClerkUserId,
                p.CreatedAt,
                p.UpdatedAt,
                p.UpdatedBy
            })
            .ToListAsync(ct);

        var items = pageRows.Select(p =>
        {
            var normalizedEmail = string.IsNullOrWhiteSpace(p.Email) ? null : p.Email.Trim().ToLowerInvariant();
            var dupCount = normalizedEmail is not null && dupEmailCounts.TryGetValue(normalizedEmail, out var c)
                ? c
                : (normalizedEmail is not null ? 1 : 0);

            return new PatientIdentityDirectoryItemPayload
            {
                PatientId = p.Id,
                ClinicEzId = p.ClinicEzId,
                FirstName = p.FirstName,
                LastName = p.LastName,
                Email = p.Email,
                ClerkUserId = p.ClerkUserId,
                IdentityStatus = ComputeIdentityStatus(p.ClerkUserId, p.UpdatedBy, dupCount),
                DuplicateEmailCount = dupCount,
                CreatedAtUtc = p.CreatedAt,
                UpdatedAtUtc = p.UpdatedAt,
                UpdatedBy = p.UpdatedBy
            };
        }).ToList();

        return new PatientIdentityDirectoryRespondedPayload
        {
            Succeeded = true,
            Summary = summary,
            Items = items,
            TotalMatching = totalMatching,
            Limit = limit,
            Offset = offset
        };
    }

    internal static bool IsPortalControlPlane(Party sender) =>
        sender.Kind == PartyKind.ControlPlane &&
        (sender.Service is null || string.Equals(sender.Service, InteropServices.Portal, StringComparison.Ordinal));

    internal static string ComputeIdentityStatus(string? clerkUserId, string? updatedBy, int duplicateEmailCount)
    {
        if (!string.IsNullOrWhiteSpace(clerkUserId))
        {
            return string.Equals(updatedBy, ClerkEmailReclaimActor, StringComparison.Ordinal)
                ? PatientIdentityStatus.Reclaimed
                : PatientIdentityStatus.ClerkLinked;
        }

        return duplicateEmailCount > 1
            ? PatientIdentityStatus.AmbiguousEmail
            : PatientIdentityStatus.Unlinked;
    }

    private static string NormalizeStatusFilter(string? raw)
    {
        var token = raw?.Trim().ToUpperInvariant();
        return token switch
        {
            PatientIdentityFilter.ClerkLinked => PatientIdentityFilter.ClerkLinked,
            PatientIdentityFilter.Unlinked => PatientIdentityFilter.Unlinked,
            PatientIdentityFilter.Reclaimed => PatientIdentityFilter.Reclaimed,
            PatientIdentityFilter.AmbiguousEmail => PatientIdentityFilter.AmbiguousEmail,
            _ => PatientIdentityFilter.All
        };
    }
}
