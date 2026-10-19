using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Mirrors the pharmacy's stage (<c>rx.status.changed</c>) onto the prescription, which is the consultation encounter. The
/// prescription is matched ONLY by its id (a GUID, the envelope correlation id) inside the clinic the message is addressed to;
/// anything that does not fit (sender is not a pharmacy, a payload naming another pharmacy or another ordering clinic, an
/// unknown prescription) is acknowledged and ignored without side effects. The stage is independent of the dispense record kept
/// by <c>rx.dispensed</c>: it adds the pharmacy's acceptance, rejection reason and quote, and never moves backwards in time.
/// </summary>
public sealed class RxStatusChangedHandler : IInteropHandler<RxStatusChangedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<RxStatusChangedHandler> _logger;

    public RxStatusChangedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<RxStatusChangedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(RxStatusChangedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        if (context.From.Kind != PartyKind.Facility || context.From.FacilityType != FacilityType.Pharmacy)
        {
            Ignore(context, "the sender is not a pharmacy");
            return;
        }

        var prescriptionId = context.CorrelationId;
        if (message.PrescriptionId != prescriptionId)
        {
            Ignore(context, $"prescription {message.PrescriptionId} does not match correlation {prescriptionId}");
            return;
        }

        if ((!string.IsNullOrWhiteSpace(message.OrderingTenantId) && !SameText(message.OrderingTenantId, clinic.TenantId))
            || (!string.IsNullOrWhiteSpace(message.OrderingFacilityId) && !SameText(message.OrderingFacilityId, clinic.ClinicId.ToString())))
        {
            Ignore(context, "the ordering clinic in the payload is not the addressed clinic");
            return;
        }

        if (!SameText(message.PharmacyFacilityId, context.From.FacilityId) || !SameText(message.PharmacyTenantId, context.From.TenantId))
        {
            Ignore(context, "the pharmacy in the payload is not the sender");
            return;
        }

        var prescription = await _dbContext.Consultations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.Id == prescriptionId, ct);
        if (prescription == null)
        {
            Ignore(context, $"prescription {prescriptionId} is unknown to clinic {clinic.ClinicId}");
            return;
        }

        if (prescription.RxStageReportedAt is { } lastReported && message.ChangedAtUtc < lastReported)
        {
            Ignore(context, "a newer stage was already recorded");
            return;
        }

        prescription.RxStage = message.Stage;
        prescription.RxStageReportedAt = message.ChangedAtUtc;
        prescription.RxStageReason = message.Reason;
        prescription.RxQuotedAmount = message.QuotedAmount ?? prescription.RxQuotedAmount;
        prescription.RxPharmacyTenantId = message.PharmacyTenantId;
        prescription.RxPharmacyFacilityId = message.PharmacyFacilityId;
        prescription.RxPharmacyName = message.PharmacyName;
        prescription.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Prescription {PrescriptionId} is now {Stage} at {Pharmacy}.",
            prescriptionId, message.Stage, message.PharmacyName);
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);

    private static bool SameText(string? a, string? b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
}
