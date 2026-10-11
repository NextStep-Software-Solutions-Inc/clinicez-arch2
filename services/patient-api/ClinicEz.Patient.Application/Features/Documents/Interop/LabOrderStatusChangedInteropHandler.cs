using System.Globalization;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>
/// Mirrors the stage of a lab order onto the patient's slip. Honoured only when the sender is the laboratory named in
/// the payload and the envelope is addressed to the patient it is about. Messages can arrive out of order: a missing slip
/// is created as a stub the document completes later, and a message older than the recorded stage is ignored.
/// </summary>
public sealed class LabOrderStatusChangedInteropHandler : IInteropHandler<LabOrderStatusChangedPayload>
{
    private static readonly HashSet<LabOrderStage> NotifiedStages =
    [
        LabOrderStage.AwaitingPayment, LabOrderStage.ResultFinalized, LabOrderStage.Rejected, LabOrderStage.Cancelled
    ];

    private readonly IPatientRepository _patients;
    private readonly IPatientDocumentRepository _documents;
    private readonly PatientDocumentNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<LabOrderStatusChangedInteropHandler> _logger;

    public LabOrderStatusChangedInteropHandler(
        IPatientRepository patients,
        IPatientDocumentRepository documents,
        PatientDocumentNotifier notifier,
        IUnitOfWork unitOfWork,
        ILogger<LabOrderStatusChangedInteropHandler> logger)
    {
        _patients = patients;
        _documents = documents;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(LabOrderStatusChangedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload.PatientId is not { } patientId
            || !DocumentInteropRules.IsFromFacility(context.From, payload.LaboratoryTenantId, payload.LaboratoryFacilityId)
            || !DocumentInteropRules.IsAddressedToPatient(context.To, patientId))
        {
            _logger.LogWarning(
                "Ignoring lab.order.status.changed {MessageId}: sender {Sender} is not laboratory {TenantId}/{FacilityId} or the patient does not match.",
                context.MessageId, context.From.Address, payload.LaboratoryTenantId, payload.LaboratoryFacilityId);
            return;
        }

        if (await _patients.GetByIdAsync(patientId, ct) is null)
        {
            _logger.LogWarning("Ignoring lab.order.status.changed {MessageId}: patient {PatientId} does not exist.", context.MessageId, patientId);
            return;
        }

        var changedAt = PatientDocumentStore.Utc(payload.ChangedAtUtc);
        var slip = await PatientDocumentStore.GetOrCreateLabSlipAsync(
            _documents, patientId, payload.RequisitionId, payload.OrderingTenantId, payload.OrderingFacilityId, changedAt, ct);

        if (!PatientDocumentStore.IsCurrent(changedAt, slip.StageChangedAt))
            return;

        var stage = PatientDocumentStore.ToDomain(payload.Stage);
        var stageChanged = slip.Stage != stage;

        slip.Stage = stage;
        slip.StageChangedAt = changedAt;
        slip.QuotedAmount = payload.QuotedAmount;
        slip.Currency = payload.Currency;
        slip.PaymentRequired = payload.PaymentRequired;
        slip.LaboratoryName = payload.LaboratoryName;
        slip.Reason = payload.Reason;

        if (stageChanged && NotifiedStages.Contains(payload.Stage))
            await _notifier.NotifyAsync(
                patientId, NotificationType.LabResult, Title(payload.Stage), Body(payload), "labRequest", payload.RequisitionId, ct);

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private static string Title(LabOrderStage stage) => stage switch
    {
        LabOrderStage.AwaitingPayment => "Lab request awaiting payment",
        LabOrderStage.ResultFinalized => "Lab result ready",
        LabOrderStage.Rejected => "Lab request rejected",
        _ => "Lab request cancelled"
    };

    private static string Body(LabOrderStatusChangedPayload payload) => payload.Stage switch
    {
        LabOrderStage.AwaitingPayment when payload.QuotedAmount is { } amount =>
            $"{payload.LaboratoryName} quoted {payload.Currency ?? "PHP"} {amount.ToString("N2", CultureInfo.InvariantCulture)} for your lab request.",
        LabOrderStage.AwaitingPayment => $"{payload.LaboratoryName} is waiting for payment of your lab request.",
        LabOrderStage.ResultFinalized => $"{payload.LaboratoryName} finished your tests.",
        _ => string.IsNullOrWhiteSpace(payload.Reason)
            ? $"{payload.LaboratoryName} updated your lab request."
            : $"{payload.LaboratoryName}: {payload.Reason}"
    };
}
