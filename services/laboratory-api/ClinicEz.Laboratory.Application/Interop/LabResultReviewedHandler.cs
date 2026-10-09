using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <summary>
/// <c>lab.result.reviewed</c>: the ordering clinic's doctor accepted or rejected a result, sent back to the laboratory
/// that performed the order.
/// <list type="bullet">
/// <item>The envelope <c>To</c> (tenant + laboratory) is the data scope; the order is matched by the envelope correlation id
/// (the clinic's requisition id, stored when the order arrived) inside that laboratory only.</item>
/// <item>Only the ordering clinic may review its own order: <c>From</c> must be the ordering tenant and facility recorded on
/// the order. Anything else (unknown order, other sender, an unverified or inconsistent verdict) is acknowledged and ignored.</item>
/// <item>The verdict, who gave it, when and the remarks are recorded on the requisition. Nothing else changes: the
/// laboratory's own report and stage are not affected by the doctor's review.</item>
/// <item>Idempotent: a redelivery, or a verdict older than the one recorded, changes nothing.</item>
/// </list>
/// </summary>
public sealed class LabResultReviewedHandler : IInteropHandler<LabResultReviewedPayload>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabContext _labContext;
    private readonly ILogger<LabResultReviewedHandler> _logger;

    public LabResultReviewedHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabContext labContext,
        ILogger<LabResultReviewedHandler> logger)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _labContext = labContext;
        _logger = logger;
    }

    public async Task HandleAsync(LabResultReviewedPayload msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || to.FacilityType != FacilityType.Laboratory
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var laboratoryId))
        {
            _logger.LogWarning(
                "[LabResultReviewedHandler] Ignoring lab.result.reviewed {MessageId}: {Recipient} is not a laboratory address.",
                context.MessageId, to.Address);
            return;
        }

        if (from.Kind != PartyKind.Facility
            || from.FacilityType != FacilityType.Clinic
            || string.IsNullOrWhiteSpace(from.TenantId)
            || string.IsNullOrWhiteSpace(from.FacilityId))
        {
            _logger.LogWarning(
                "[LabResultReviewedHandler] Ignoring lab.result.reviewed {MessageId}: sender {Sender} is not an identifiable clinic.",
                context.MessageId, from.Address);
            return;
        }

        var outcome = msg.State switch
        {
            VerificationState.Verified => DoctorReviewOutcome.Accepted,
            VerificationState.Rejected => DoctorReviewOutcome.Rejected,
            _ => DoctorReviewOutcome.None
        };

        if (outcome == DoctorReviewOutcome.None || msg.RequisitionId != context.CorrelationId)
        {
            _logger.LogWarning(
                "[LabResultReviewedHandler] Ignoring lab.result.reviewed {MessageId}: the verdict is not a decision on order {CorrelationId}.",
                context.MessageId, context.CorrelationId);
            return;
        }

        using var scope = _labContext.BeginFacilityScope(to.TenantId, laboratoryId);

        var correlationId = context.CorrelationId;
        var requisition = await _requisitionRepository.Query()
            .FirstOrDefaultAsync(r =>
                r.CorrelationId == correlationId
                && r.OrderingTenantId == from.TenantId
                && r.OrderingFacilityId == from.FacilityId, ct);

        if (requisition == null)
        {
            _logger.LogWarning(
                "[LabResultReviewedHandler] Ignoring lab.result.reviewed {MessageId}: no order {CorrelationId} from {Sender} in laboratory {LaboratoryId}.",
                context.MessageId, correlationId, from.Address, laboratoryId);
            return;
        }

        if (requisition.DoctorReviewOutcome != DoctorReviewOutcome.None && requisition.DoctorReviewedAtUtc >= msg.ReviewedAtUtc)
        {
            _logger.LogInformation(
                "[LabResultReviewedHandler] Order {RequisitionId}: review of {ReviewedAtUtc:u} is already recorded. Skipping.",
                requisition.Id, msg.ReviewedAtUtc);
            return;
        }

        requisition.DoctorReviewOutcome = outcome;
        requisition.DoctorReviewedAtUtc = msg.ReviewedAtUtc;
        requisition.DoctorReviewedByName = msg.ReviewedByName;
        requisition.DoctorReviewedByPrc = msg.ReviewedByPrc;
        requisition.DoctorReviewRemarks = msg.Remarks;
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[LabResultReviewedHandler] Order {RequisitionId}: result {Outcome} by {ReviewedBy}.",
            requisition.Id, outcome, msg.ReviewedByName);
    }
}
