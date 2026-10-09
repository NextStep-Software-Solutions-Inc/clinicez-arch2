using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

/// <summary>
/// Owns the order lifecycle (<see cref="RequisitionStage"/>). Every stage change is mirrored as
/// <c>lab.order.status.changed</c> to the ordering clinic and, when the patient is a ClinicEZ patient, to the patient.
/// Messages are queued in the outbox only; the caller commits them atomically with its own <c>SaveChanges</c>.
/// </summary>
public interface ILabOrderLifecycle
{
    /// <summary>First stage of a newly accepted order (<see cref="RequisitionStage.Routed"/> or <see cref="RequisitionStage.Claimed"/>).</summary>
    Task BeginAsync(LabRequisition requisition, RequisitionStage initialStage, CancellationToken ct);

    /// <summary>
    /// Moves the order forward. Returns <c>false</c> (and queues nothing) when the move is not allowed from the current
    /// stage, which makes redeliveries and repeated calls harmless.
    /// </summary>
    Task<bool> TransitionAsync(LabRequisition requisition, RequisitionStage stage, string? reason, CancellationToken ct);

    /// <summary>Display name of the laboratory that owns the order.</summary>
    Task<string> GetLaboratoryNameAsync(LabRequisition requisition, CancellationToken ct);
}
