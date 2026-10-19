using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Attaches a laboratory's finalized report (<c>lab.result.finalized</c>) to the clinic's lab order as a Verified
/// ClinicEZ-lab result. The order is identified only by the envelope correlation id (the requisition id the clinic issued);
/// accession and order numbers are lab-assigned display values and are never used to match. The signed PDF is stored
/// encrypted in clinic storage, never in a row. Re-applying the same report (same report id) is a no-op.
/// </summary>
public sealed class DiagnosticReportFinalizedHandler : IInteropHandler<DiagnosticReportFinalizedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILabResultFileStore _files;
    private readonly IPatientDocumentPublisher _documents;
    private readonly ILogger<DiagnosticReportFinalizedHandler> _logger;

    public DiagnosticReportFinalizedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILabResultFileStore files,
        IPatientDocumentPublisher documents,
        ILogger<DiagnosticReportFinalizedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _files = files;
        _documents = documents;
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

        var alreadyIngested = await _dbContext.LabResults
            .IgnoreQueryFilters()
            .AnyAsync(r => !r.IsDeleted && r.ClinicId == clinic.ClinicId && r.LabOrderId == order.Id && r.ReportId == message.ReportId, ct);
        if (alreadyIngested)
        {
            _logger.LogInformation("[ClinicEz.Clinic] Report {ReportId} for requisition {RequisitionId} was already ingested.",
                message.ReportId, requisitionId);
            return;
        }

        var now = DateTime.UtcNow;
        var result = new ClinicLabResult
        {
            Id = Guid.NewGuid(),
            TenantId = clinic.TenantId,
            ClinicId = clinic.ClinicId,
            LabOrderId = order.Id,
            ReportId = message.ReportId,
            Source = ResultSource.ClinicEzLab,
            Verification = VerificationState.Verified,
            ExternalLabName = message.LaboratoryName,
            FileName = $"LabReport-{order.OrderNumber}.pdf",
            ContentType = "application/pdf",
            SubmittedAt = message.ReleasedAt,
            VerifiedByName = message.PathologistName,
            VerifiedByPrc = message.PathologistPrcLicense,
            VerifiedAt = message.ReleasedAt,
            CreatedAt = now,
            CreatedBy = "ClinicEzLab"
        };

        if (!string.IsNullOrEmpty(message.SignedPdfBase64))
        {
            await _files.StoreAsync(result, Convert.FromBase64String(message.SignedPdfBase64), ct);
        }

        _dbContext.LabResults.Add(result);

        order.ExternalLabName = message.LaboratoryName;
        order.ExternalReportType = "DigitalDiagnosticReport";
        order.ObservationsJson = JsonSerializer.Serialize(message.Observations);
        order.PathologistImpression = message.PathologistImpression;
        order.VerifiedByPathologist = message.PathologistName;
        order.PathologistPrcLicense = message.PathologistPrcLicense;
        order.ReportReleasedAt = message.ReleasedAt;
        order.Status = LabOrderStatus.ResultsReceived;
        order.Stage = LabOrderStage.ResultFinalized;
        order.StageChangedAt = now;
        order.StageReportedAt = message.ReleasedAt;
        order.LaboratoryTenantId = message.LaboratoryTenantId;
        order.LaboratoryFacilityId = message.LaboratoryFacilityId;
        order.LaboratoryName = message.LaboratoryName;

        foreach (var item in order.Items)
        {
            item.Status = LabOrderStatus.ResultsReceived;
        }

        await _documents.PublishAsync(LabResultDocuments.For(order, result, message with { SignedPdfBase64 = null }), ct);
        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Successfully attached verified lab results to patient EMR for requisition {RequisitionId}",
            requisitionId);
    }
}
