using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <inheritdoc cref="ILabOrderLifecycle"/>
public sealed class LabOrderLifecycle : ILabOrderLifecycle
{
    private const string FallbackLaboratoryName = "Laboratory";

    private readonly IInteropPublisher _publisher;
    private readonly IRepository<LabSettings> _settingsRepository;
    private readonly ILogger<LabOrderLifecycle> _logger;
    private readonly Dictionary<Guid, string> _laboratoryNames = new();

    public LabOrderLifecycle(
        IInteropPublisher publisher,
        IRepository<LabSettings> settingsRepository,
        ILogger<LabOrderLifecycle> logger)
    {
        _publisher = publisher;
        _settingsRepository = settingsRepository;
        _logger = logger;
    }

    public async Task BeginAsync(LabRequisition requisition, RequisitionStage initialStage, CancellationToken ct)
    {
        await ApplyAsync(requisition, initialStage, reason: null, ct);
    }

    public async Task<bool> TransitionAsync(LabRequisition requisition, RequisitionStage stage, string? reason, CancellationToken ct)
    {
        if (!CanMove(requisition.Stage, stage))
        {
            _logger.LogDebug(
                "[LabOrderLifecycle] Requisition {RequisitionId}: {From} -> {To} is not a forward move; nothing to announce.",
                requisition.Id, requisition.Stage, stage);
            return false;
        }

        await ApplyAsync(requisition, stage, reason, ct);
        return true;
    }

    public async Task<bool> ReopenForPaymentAsync(LabRequisition requisition, string reason, CancellationToken ct)
    {
        if (requisition.Stage != RequisitionStage.Paid)
        {
            return false;
        }

        await ApplyAsync(requisition, RequisitionStage.AwaitingPayment, reason, ct);
        return true;
    }

    public async Task<string> GetLaboratoryNameAsync(LabRequisition requisition, CancellationToken ct)
    {
        if (_laboratoryNames.TryGetValue(requisition.LaboratoryId, out var cached))
        {
            return cached;
        }

        var name = await _settingsRepository.Query()
            .AsNoTracking()
            .Where(s => s.LaboratoryId == requisition.LaboratoryId && !s.IsDeleted)
            .Select(s => s.LaboratoryName)
            .FirstOrDefaultAsync(ct);

        name = string.IsNullOrWhiteSpace(name) ? FallbackLaboratoryName : name;
        _laboratoryNames[requisition.LaboratoryId] = name;
        return name;
    }

    private async Task ApplyAsync(LabRequisition requisition, RequisitionStage stage, string? reason, CancellationToken ct)
    {
        var changedAt = DateTime.UtcNow;
        requisition.Stage = stage;
        requisition.StageChangedAtUtc = changedAt;
        if (stage is RequisitionStage.Rejected or RequisitionStage.Cancelled)
        {
            requisition.StageReason = reason;
        }

        var payload = new LabOrderStatusChangedPayload
        {
            RequisitionId = requisition.ClinicRequisitionId,
            OrderingTenantId = requisition.OrderingTenantId,
            OrderingFacilityId = requisition.OrderingFacilityId,
            PatientId = requisition.HasClinicEzPatient ? requisition.PatientId : null,
            LaboratoryTenantId = requisition.TenantId,
            LaboratoryFacilityId = requisition.LaboratoryId.ToString(),
            LaboratoryName = await GetLaboratoryNameAsync(requisition, ct),
            Stage = ToWireStage(stage),
            QuotedAmount = requisition.QuotedAmount,
            Currency = requisition.QuotedAmount is null ? null : requisition.Currency,
            PaymentRequired = requisition.IsPaymentBlocking,
            Reason = reason,
            ChangedAtUtc = changedAt
        };

        var from = LabInteropParties.Laboratory(requisition.TenantId, requisition.LaboratoryId.ToString());
        var correlationId = requisition.ClinicRequisitionId;

        if (string.IsNullOrWhiteSpace(requisition.OrderingTenantId) || string.IsNullOrWhiteSpace(requisition.OrderingFacilityId))
        {
            _logger.LogWarning(
                "[LabOrderLifecycle] Requisition {RequisitionId} has no ordering clinic; the {Stage} status cannot be sent to a clinic.",
                requisition.Id, stage);
        }
        else
        {
            _publisher.Enqueue(
                InteropTypes.LabOrderStatusChanged,
                from,
                LabInteropParties.OrderingClinic(requisition.OrderingTenantId, requisition.OrderingFacilityId),
                correlationId,
                payload);
        }

        // Only a known ClinicEZ patient has a mailbox; an unknown patient id is never invented.
        if (requisition.HasClinicEzPatient)
        {
            _publisher.Enqueue(
                InteropTypes.LabOrderStatusChanged,
                from,
                Party.ForPatient(requisition.PatientId.ToString()),
                correlationId,
                payload);
        }
    }

    /// <summary>Forward-only lifecycle: a stage can only be followed by a later one; finished orders never move again.</summary>
    public static bool CanMove(RequisitionStage from, RequisitionStage to)
    {
        if (from is RequisitionStage.ResultFinalized or RequisitionStage.Rejected or RequisitionStage.Cancelled)
        {
            return false;
        }

        if (to is RequisitionStage.Rejected or RequisitionStage.Cancelled)
        {
            return true;
        }

        return Rank(to) > Rank(from);
    }

    private static int Rank(RequisitionStage stage) => stage switch
    {
        RequisitionStage.Routed or RequisitionStage.Claimed => 0,
        RequisitionStage.AwaitingPayment => 1,
        RequisitionStage.Paid => 2,
        RequisitionStage.SpecimenCollected => 3,
        RequisitionStage.InProcess => 4,
        RequisitionStage.ResultFinalized => 5,
        _ => throw new ArgumentOutOfRangeException(nameof(stage), stage, "Terminal stages have no rank.")
    };

    /// <summary>The Domain enum mirrors the wire enum by name; a unit test pins that every name exists on both sides.</summary>
    public static LabOrderStage ToWireStage(RequisitionStage stage) => Enum.Parse<LabOrderStage>(stage.ToString());
}
