using System;
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
/// Answers <see cref="InteropTypes.PatientIdentityReconcileRequested"/> from <see cref="Party.Portal"/>,
/// allowing authorized platform administrators to explicitly bind or unbind a verified Clerk <c>user_*</c>
/// identity on a primary patient profile. Changes remain tracked on <see cref="ApplicationDbContext"/> so
/// <see cref="IInteropResponder{TRequest,TResponse}"/> commits the mutation and the reply envelope atomically.
/// </summary>
public sealed class PatientIdentityReconcileResponder(
    ApplicationDbContext db,
    ILogger<PatientIdentityReconcileResponder> logger)
    : IInteropResponder<PatientIdentityReconcileRequestedPayload, PatientIdentityReconcileRespondedPayload>
{
    public async Task<PatientIdentityReconcileRespondedPayload> RespondAsync(
        PatientIdentityReconcileRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        if (!PatientIdentityDirectoryResponder.IsPortalControlPlane(context.From))
        {
            logger.LogWarning(
                "Rejected patient.identity.reconcile.requested {MessageId} from unauthorized sender {Sender}.",
                context.MessageId,
                context.From.Address);

            return Failure("UNAUTHORIZED", "Only the platform control plane may reconcile patient identities.");
        }

        var action = request.Action?.Trim().ToUpperInvariant();
        if (action is not (PatientIdentityReconcileAction.BindClerk or PatientIdentityReconcileAction.UnbindClerk))
        {
            return Failure("VALIDATION_ERROR", "Action must be BIND_CLERK or UNBIND_CLERK.");
        }

        if (request.PatientId == Guid.Empty)
        {
            return Failure("VALIDATION_ERROR", "PatientId is required.");
        }

        var patient = await db.Patients
            .FirstOrDefaultAsync(p => p.Id == request.PatientId && p.ManagedByPatientId == null && !p.IsDeleted, ct);

        if (patient is null)
        {
            return Failure("NOT_FOUND", $"Primary patient '{request.PatientId}' was not found.");
        }

        var actor = string.IsNullOrWhiteSpace(request.Actor) ? "platform-admin" : request.Actor.Trim();

        if (action == PatientIdentityReconcileAction.BindClerk)
        {
            var clerkId = request.ClerkUserId?.Trim();
            if (string.IsNullOrWhiteSpace(clerkId) ||
                !clerkId.StartsWith("user_", StringComparison.Ordinal) ||
                clerkId.Length > 128)
            {
                return Failure("VALIDATION_ERROR", "ClerkUserId must be a valid Clerk identifier starting with 'user_' (max 128 characters).");
            }

            var existingHolder = await db.Patients
                .AsNoTracking()
                .AnyAsync(p => p.ClerkUserId == clerkId && p.Id != patient.Id && !p.IsDeleted, ct);

            if (existingHolder)
            {
                return Failure("CONFLICT", $"Clerk user '{clerkId}' is already bound to another patient account.");
            }

            patient.ClerkUserId = clerkId;
            patient.UpdatedAt = DateTime.UtcNow;
            patient.UpdatedBy = BuildActorTag("AdminReconcile", actor);
        }
        else
        {
            patient.ClerkUserId = null;
            patient.UpdatedAt = DateTime.UtcNow;
            patient.UpdatedBy = BuildActorTag("AdminUnbind", actor);
        }

        var dupCount = 0;
        if (!string.IsNullOrWhiteSpace(patient.Email))
        {
            var normEmail = patient.Email.Trim().ToLowerInvariant();
            dupCount = await db.Patients
                .AsNoTracking()
                .CountAsync(p => p.ManagedByPatientId == null && !p.IsDeleted &&
                                 p.Email != null && p.Email.Trim().ToLower() == normEmail, ct);
        }

        logger.LogInformation(
            "Patient identity reconcile {Action} applied for PatientId={PatientId} by {Actor}.",
            action,
            patient.Id,
            actor);

        return new PatientIdentityReconcileRespondedPayload
        {
            Succeeded = true,
            Item = new PatientIdentityDirectoryItemPayload
            {
                PatientId = patient.Id,
                ClinicEzId = patient.ClinicEzId,
                FirstName = patient.FirstName,
                LastName = patient.LastName,
                Email = patient.Email,
                ClerkUserId = patient.ClerkUserId,
                IdentityStatus = PatientIdentityDirectoryResponder.ComputeIdentityStatus(
                    patient.ClerkUserId, patient.UpdatedBy, dupCount),
                DuplicateEmailCount = dupCount,
                CreatedAtUtc = patient.CreatedAt,
                UpdatedAtUtc = patient.UpdatedAt,
                UpdatedBy = patient.UpdatedBy
            }
        };
    }

    private static string BuildActorTag(string prefix, string actor)
    {
        var combined = $"{prefix}:{actor}";
        return combined.Length > 128 ? combined[..128] : combined;
    }

    private static PatientIdentityReconcileRespondedPayload Failure(string code, string message) => new()
    {
        Succeeded = false,
        ErrorCode = code,
        Error = message
    };
}
