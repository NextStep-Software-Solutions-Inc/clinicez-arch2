using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Attaches a laboratory's finalized report (<c>lab.result.finalized</c>) to the clinic's lab order. The order is
/// identified only by the envelope correlation id (the requisition id the clinic issued); accession and order
/// numbers are lab-assigned display values and are never used to match. Re-applying the same report is a no-op.
/// </summary>
public sealed class DiagnosticReportFinalizedHandler : IInteropHandler<DiagnosticReportFinalizedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<DiagnosticReportFinalizedHandler> _logger;

    public DiagnosticReportFinalizedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<DiagnosticReportFinalizedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(DiagnosticReportFinalizedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        var requisitionId = context.CorrelationId;
        if (message.RequisitionId != Guid.Empty && message.RequisitionId != requisitionId)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring finalized report {MessageId}: requisition {PayloadRequisitionId} does not match correlation {CorrelationId}.",
                context.MessageId, message.RequisitionId, requisitionId);
            return;
        }

        _logger.LogInformation("[ClinicEz.Clinic] Ingesting DiagnosticReportFinalizedEvent for requisition {RequisitionId} from Lab {LabName}",
            requisitionId, message.LaboratoryName);

        var order = await _dbContext.LabOrders
            .IgnoreQueryFilters()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => !o.IsDeleted && o.ClinicId == clinic.ClinicId && o.Id == requisitionId, ct);

        if (order == null)
        {
            _logger.LogWarning("[ClinicEz.Clinic] Lab requisition {RequisitionId} not found in clinic {ClinicId}. Skipping.",
                requisitionId, clinic.ClinicId);
            return;
        }

        order.ExternalLabName = message.LaboratoryName;
        order.ExternalReportType = "DigitalDiagnosticReport";
        order.ObservationsJson = JsonSerializer.Serialize(message.Observations);
        order.PathologistImpression = message.PathologistImpression;
        order.VerifiedByPathologist = message.PathologistName;
        order.PathologistPrcLicense = message.PathologistPrcLicense;
        order.ExternalReportFileBase64 = message.SignedPdfBase64;
        order.ReportReleasedAt = message.ReleasedAt;
        order.Status = LabOrderStatus.ResultsReceived;

        foreach (var item in order.Items)
        {
            item.Status = LabOrderStatus.ResultsReceived;
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Successfully attached verified lab results to patient EMR for requisition {RequisitionId}",
            requisitionId);
    }
}
