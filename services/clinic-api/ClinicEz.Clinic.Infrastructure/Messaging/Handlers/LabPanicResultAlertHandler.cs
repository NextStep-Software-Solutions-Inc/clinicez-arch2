using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Flags a clinic lab order with a laboratory's critical (panic) finding (<c>lab.result.panic</c>). Only an order
/// the clinic itself issued, identified by the envelope correlation id, can be flagged: an alert for an unknown
/// requisition is logged and dropped, never turned into a new order.
/// </summary>
public sealed class LabPanicResultAlertHandler : IInteropHandler<LabPanicResultAlertEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<LabPanicResultAlertHandler> _logger;

    public LabPanicResultAlertHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<LabPanicResultAlertHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(LabPanicResultAlertEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        var requisitionId = context.CorrelationId;
        if (message.RequisitionId != Guid.Empty && message.RequisitionId != requisitionId)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring panic alert {MessageId}: requisition {PayloadRequisitionId} does not match correlation {CorrelationId}.",
                context.MessageId, message.RequisitionId, requisitionId);
            return;
        }

        _logger.LogWarning(
            "[ClinicEz.Clinic] STAT CRITICAL PANIC ALERT received for requisition {RequisitionId}. TriggeredAt: {TriggeredAt}",
            requisitionId, message.TriggeredAt);

        var order = await _dbContext.LabOrders
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => !o.IsDeleted && o.ClinicId == clinic.ClinicId && o.Id == requisitionId, ct);

        if (order == null)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Panic alert for requisition {RequisitionId} matches no order of clinic {ClinicId}. Dropping it.",
                requisitionId, clinic.ClinicId);
            return;
        }

        order.HasCriticalPanicAlert = true;
        order.CriticalFindingsJson = JsonSerializer.Serialize(message.CriticalFindings);
        order.PanicAlertTriggeredAt = message.TriggeredAt;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Successfully registered STAT critical panic alert for requisition {RequisitionId}", requisitionId);
    }
}
