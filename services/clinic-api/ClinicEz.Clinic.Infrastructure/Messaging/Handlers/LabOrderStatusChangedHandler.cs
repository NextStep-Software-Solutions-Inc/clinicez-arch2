using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Mirrors the performing laboratory's stage (<c>lab.order.status.changed</c>) onto the clinic's lab order. The order is
/// matched ONLY by the requisition id (a GUID, the envelope correlation id) inside the clinic the message is addressed to;
/// anything that does not fit (sender is not a laboratory, an order routed to a different laboratory, ordering tenant or
/// facility of another clinic, unknown order) is acknowledged and ignored without side effects.
/// </summary>
public sealed class LabOrderStatusChangedHandler : IInteropHandler<LabOrderStatusChangedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<LabOrderStatusChangedHandler> _logger;

    public LabOrderStatusChangedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<LabOrderStatusChangedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(LabOrderStatusChangedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        if (context.From.Kind != PartyKind.Facility || context.From.FacilityType != FacilityType.Laboratory)
        {
            Ignore(context, "the sender is not a laboratory");
            return;
        }

        var requisitionId = context.CorrelationId;
        if (message.RequisitionId != requisitionId)
        {
            Ignore(context, $"requisition {message.RequisitionId} does not match correlation {requisitionId}");
            return;
        }

        if ((!string.IsNullOrWhiteSpace(message.OrderingTenantId) && !SameText(message.OrderingTenantId, clinic.TenantId))
            || (!string.IsNullOrWhiteSpace(message.OrderingFacilityId) && !SameText(message.OrderingFacilityId, clinic.ClinicId.ToString())))
        {
            Ignore(context, "the ordering clinic in the payload is not the addressed clinic");
            return;
        }

        if (!SameText(message.LaboratoryFacilityId, context.From.FacilityId))
        {
            Ignore(context, "the laboratory in the payload is not the sender");
            return;
        }

        var order = await _dbContext.LabOrders
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => !o.IsDeleted && o.ClinicId == clinic.ClinicId && o.Id == requisitionId, ct);
        if (order == null)
        {
            Ignore(context, $"requisition {requisitionId} is unknown to clinic {clinic.ClinicId}");
            return;
        }

        if (order.TargetFacilityId is { } targetFacility
            && (!SameText(targetFacility.ToString(), context.From.FacilityId) || !SameText(order.TargetTenantId, context.From.TenantId)))
        {
            Ignore(context, "the order was routed to a different laboratory");
            return;
        }

        if (order.StageReportedAt is { } lastReported && message.ChangedAtUtc < lastReported)
        {
            Ignore(context, "a newer stage was already recorded");
            return;
        }

        order.Stage = message.Stage;
        order.StageChangedAt = DateTime.UtcNow;
        order.StageReportedAt = message.ChangedAtUtc;
        order.StageReason = message.Reason;
        order.QuotedAmount = message.QuotedAmount ?? order.QuotedAmount;
        order.QuotedCurrency = message.Currency ?? order.QuotedCurrency;
        order.PaymentRequired = message.PaymentRequired;
        order.LaboratoryTenantId = message.LaboratoryTenantId;
        order.LaboratoryFacilityId = message.LaboratoryFacilityId;
        order.LaboratoryName = message.LaboratoryName;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Lab order {RequisitionId} is now {Stage} at {Laboratory}.",
            requisitionId, message.Stage, message.LaboratoryName);
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);

    private static bool SameText(string? a, string? b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
}
