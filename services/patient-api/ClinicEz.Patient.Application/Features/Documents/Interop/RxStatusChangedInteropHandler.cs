using System.Globalization;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>
/// Mirrors the stage of a prescription onto the patient's copy. Honoured only when the sender is the pharmacy named in
/// the payload and the envelope is addressed to the patient it is about. Out-of-order messages are handled like lab
/// status updates: a missing prescription becomes a stub, an older message is ignored.
/// </summary>
public sealed class RxStatusChangedInteropHandler : IInteropHandler<RxStatusChangedPayload>
{
    private static readonly HashSet<RxStage> NotifiedStages =
    [
        RxStage.Accepted, RxStage.PartiallyAccepted, RxStage.Rejected, RxStage.Dispensed
    ];

    private readonly IPatientRepository _patients;
    private readonly IPatientDocumentRepository _documents;
    private readonly PatientDocumentNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<RxStatusChangedInteropHandler> _logger;

    public RxStatusChangedInteropHandler(
        IPatientRepository patients,
        IPatientDocumentRepository documents,
        PatientDocumentNotifier notifier,
        IUnitOfWork unitOfWork,
        ILogger<RxStatusChangedInteropHandler> logger)
    {
        _patients = patients;
        _documents = documents;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(RxStatusChangedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload.PatientId is not { } patientId
            || !DocumentInteropRules.IsFromFacility(context.From, payload.PharmacyTenantId, payload.PharmacyFacilityId)
            || !DocumentInteropRules.IsAddressedToPatient(context.To, patientId))
        {
            _logger.LogWarning(
                "Ignoring rx.status.changed {MessageId}: sender {Sender} is not pharmacy {TenantId}/{FacilityId} or the patient does not match.",
                context.MessageId, context.From.Address, payload.PharmacyTenantId, payload.PharmacyFacilityId);
            return;
        }

        if (await _patients.GetByIdAsync(patientId, ct) is null)
        {
            _logger.LogWarning("Ignoring rx.status.changed {MessageId}: patient {PatientId} does not exist.", context.MessageId, patientId);
            return;
        }

        var changedAt = PatientDocumentStore.Utc(payload.ChangedAtUtc);
        var prescription = await PatientDocumentStore.GetOrCreatePrescriptionAsync(
            _documents, patientId, payload.PrescriptionId, payload.OrderingTenantId, payload.OrderingFacilityId, changedAt, ct);

        if (!PatientDocumentStore.IsCurrent(changedAt, prescription.StageChangedAt))
            return;

        var stage = PatientDocumentStore.ToDomain(payload.Stage);
        var stageChanged = prescription.Stage != stage;

        prescription.Stage = stage;
        prescription.StageChangedAt = changedAt;
        prescription.QuotedAmount = payload.QuotedAmount;
        prescription.PharmacyName = payload.PharmacyName;

        if (stageChanged && NotifiedStages.Contains(payload.Stage))
            await _notifier.NotifyAsync(
                patientId, NotificationType.System, Title(payload.Stage), Body(payload), "prescription", payload.PrescriptionId, ct);

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private static string Title(RxStage stage) => stage switch
    {
        RxStage.Accepted => "Prescription accepted",
        RxStage.PartiallyAccepted => "Prescription partly accepted",
        RxStage.Rejected => "Prescription rejected",
        _ => "Prescription dispensed"
    };

    private static string Body(RxStatusChangedPayload payload) => payload.Stage switch
    {
        RxStage.Accepted or RxStage.PartiallyAccepted when payload.QuotedAmount is { } amount =>
            $"{payload.PharmacyName} will fill your prescription for PHP {amount.ToString("N2", CultureInfo.InvariantCulture)}.",
        RxStage.Rejected when !string.IsNullOrWhiteSpace(payload.Reason) => $"{payload.PharmacyName}: {payload.Reason}",
        RxStage.Dispensed => $"{payload.PharmacyName} dispensed your prescription.",
        _ => $"{payload.PharmacyName} updated your prescription."
    };
}
