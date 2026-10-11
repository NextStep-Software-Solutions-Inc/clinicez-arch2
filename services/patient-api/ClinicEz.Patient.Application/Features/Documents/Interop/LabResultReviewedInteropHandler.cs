using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>
/// Records the ordering doctor's verdict on an unverified (external or patient-uploaded) result. Only the facility that
/// ordered the tests may review them, and only for the patient the envelope is addressed to. The slip always follows the
/// verdict; the report is updated when this patient already holds it.
/// </summary>
public sealed class LabResultReviewedInteropHandler : IInteropHandler<LabResultReviewedPayload>
{
    private readonly IPatientRepository _patients;
    private readonly IPatientDocumentRepository _documents;
    private readonly PatientDocumentNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<LabResultReviewedInteropHandler> _logger;

    public LabResultReviewedInteropHandler(
        IPatientRepository patients,
        IPatientDocumentRepository documents,
        PatientDocumentNotifier notifier,
        IUnitOfWork unitOfWork,
        ILogger<LabResultReviewedInteropHandler> logger)
    {
        _patients = patients;
        _documents = documents;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(LabResultReviewedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload.PatientId is not { } patientId || !DocumentInteropRules.IsAddressedToPatient(context.To, patientId))
        {
            _logger.LogWarning("Ignoring lab.result.reviewed {MessageId}: not addressed to the patient it is about.", context.MessageId);
            return;
        }

        if (await _patients.GetByIdAsync(patientId, ct) is null)
        {
            _logger.LogWarning("Ignoring lab.result.reviewed {MessageId}: patient {PatientId} does not exist.", context.MessageId, patientId);
            return;
        }

        var slip = await _documents.GetLabSlipAsync(patientId, payload.RequisitionId, ct);
        if (slip is null || !DocumentInteropRules.IsFromFacility(context.From, slip.OrderingTenantId, slip.OrderingFacilityId))
        {
            _logger.LogWarning(
                "Ignoring lab.result.reviewed {MessageId}: sender {Sender} is not the ordering facility of requisition {RequisitionId}.",
                context.MessageId, context.From.Address, payload.RequisitionId);
            return;
        }

        var reviewedAt = PatientDocumentStore.Utc(payload.ReviewedAtUtc);
        var report = payload.ReportId is { } reportId
            ? await _documents.GetLabReportAsync(patientId, reportId, ct)
            : await _documents.GetLabReportForRequisitionAsync(patientId, payload.RequisitionId, ct);

        if (report is not null)
            ApplyVerdict(report, payload, reviewedAt);

        var stage = payload.State switch
        {
            VerificationState.Verified => LabSlipStage.Reviewed,
            VerificationState.Rejected => LabSlipStage.Rejected,
            _ => (LabSlipStage?)null
        };

        if (stage is { } next && PatientDocumentStore.IsCurrent(reviewedAt, slip.StageChangedAt))
        {
            slip.Stage = next;
            slip.StageChangedAt = reviewedAt;
            slip.Reason = payload.State == VerificationState.Rejected ? payload.Remarks : slip.Reason;
        }

        if (payload.State != VerificationState.Unverified)
            await _notifier.NotifyAsync(
                patientId, NotificationType.LabResult,
                payload.State == VerificationState.Verified ? "Lab result reviewed" : "Lab result not accepted",
                Body(payload), "labResult", report?.ReportId ?? payload.RequisitionId, ct);

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private static void ApplyVerdict(LabResultReport report, LabResultReviewedPayload payload, DateTime reviewedAt)
    {
        report.Verification = PatientDocumentStore.ToDomain(payload.State);
        report.ReviewedByName = payload.ReviewedByName;
        report.ReviewedByPrc = payload.ReviewedByPrc;
        report.ReviewedAt = reviewedAt;
        report.ReviewRemarks = payload.Remarks;
    }

    private static string Body(LabResultReviewedPayload payload)
    {
        var verdict = payload.State == VerificationState.Verified
            ? $"{payload.ReviewedByName} reviewed and accepted your result."
            : $"{payload.ReviewedByName} could not accept your result.";

        return string.IsNullOrWhiteSpace(payload.Remarks) ? verdict : $"{verdict} {payload.Remarks}";
    }
}
