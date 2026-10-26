using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <summary>
/// <c>lab.order.issued</c>: ingests a clinic's requisition into the laboratory worklist.
/// <list type="bullet">
/// <item>The envelope <c>To</c> (tenant + laboratory) sets the data scope of the whole handler: the requisition is created for
/// that laboratory, never for whatever the payload claims, and nothing outside that laboratory can be read or matched.</item>
/// <item>The envelope <c>From</c> (tenant + facility) is stored as the ordering party and the envelope correlation
/// id (the clinic's requisition id) is stored as well: results and panic alerts are addressed from them.</item>
/// <item>Idempotent per ordering facility and requisition id. Accession numbers are per-laboratory and are never used
/// to match requisitions across tenants.</item>
/// <item>An order the clinic addressed to this laboratory starts as <see cref="RequisitionStage.Routed"/>; an order that
/// reached it through a patient-carried claim (the clinic named no target laboratory) starts as
/// <see cref="RequisitionStage.Claimed"/>.</item>
/// <item>Unless the laboratory's <see cref="PaymentPolicy"/> is <see cref="PaymentPolicy.None"/>, the order is quoted from
/// the laboratory's catalogue, billing is asked to invoice it (<c>billing.invoice.requested</c>) and the order waits in
/// <see cref="RequisitionStage.AwaitingPayment"/>. Every stage is announced to the clinic and the patient.</item>
/// </list>
/// </summary>
public sealed class LabOrderIssuedHandler : IInteropHandler<LabRequisitionIssuedEvent>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IRepository<LabSettings> _settingsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabContext _labContext;
    private readonly ILabOrderLifecycle _lifecycle;
    private readonly ILabOrderBilling _billing;
    private readonly ILogger<LabOrderIssuedHandler> _logger;
    private readonly IInteropPublisher? _publisher;

    public LabOrderIssuedHandler(
        IRepository<LabRequisition> requisitionRepository,
        IRepository<LabSettings> settingsRepository,
        IUnitOfWork unitOfWork,
        ILabContext labContext,
        ILabOrderLifecycle lifecycle,
        ILabOrderBilling billing,
        ILogger<LabOrderIssuedHandler> logger,
        IInteropPublisher? publisher = null)
    {
        _requisitionRepository = requisitionRepository;
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _labContext = labContext;
        _lifecycle = lifecycle;
        _billing = billing;
        _logger = logger;
        _publisher = publisher;
    }

    public async Task HandleAsync(LabRequisitionIssuedEvent msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        if (from.Kind != PartyKind.Facility
            || from.FacilityType != FacilityType.Clinic
            || string.IsNullOrWhiteSpace(from.TenantId)
            || string.IsNullOrWhiteSpace(from.FacilityId))
        {
            _logger.LogWarning(
                "[LabOrderIssuedHandler] Ignoring lab.order.issued {MessageId}: sender {Sender} is not an identifiable clinic.",
                context.MessageId, from.Address);
            return;
        }

        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var laboratoryId))
        {
            _logger.LogWarning(
                "[LabOrderIssuedHandler] Ignoring lab.order.issued {MessageId}: {Recipient} is not a laboratory address.",
                context.MessageId, to.Address);
            return;
        }

        using var scope = _labContext.BeginFacilityScope(to.TenantId, laboratoryId);

        var laboratory = await _settingsRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.LaboratoryId == laboratoryId, ct);

        // Not provisioned here for this tenant (yet): fail so the hub redelivers rather than silently losing the order.
        if (laboratory == null)
        {
            throw new InvalidOperationException(
                $"Laboratory {laboratoryId} of tenant {to.TenantId} is not provisioned in this service; cannot accept lab.order.issued {context.MessageId}.");
        }

        _logger.LogInformation(
            "[LabOrderIssuedHandler] Received lab order {RequisitionId} (Accession {AccessionNumber}, Patient {PatientName}) from {Sender}",
            msg.RequisitionId, msg.AccessionNumber, msg.Patient.FullName, from.Address);

        var alreadyIngested = await _requisitionRepository.Query()
            .AnyAsync(r =>
                r.OrderingTenantId == from.TenantId
                && r.OrderingFacilityId == from.FacilityId
                && r.ExternalRequisitionId == msg.RequisitionId, ct);

        if (alreadyIngested)
        {
            _logger.LogInformation(
                "[LabOrderIssuedHandler] Requisition {RequisitionId} from {Sender} already exists. Skipping insertion.",
                msg.RequisitionId, from.Address);
            return;
        }

        // The ordering clinic's accession number is only unique within that clinic. Keep it when it is free in this
        // laboratory, otherwise make it unique here so another clinic's order is never dropped or merged.
        var accessionNumber = msg.AccessionNumber;
        if (await _requisitionRepository.Query().AnyAsync(r => r.AccessionNumber == accessionNumber, ct))
        {
            accessionNumber = $"{msg.AccessionNumber}-{msg.RequisitionId.ToString("N")[..8]}";
        }

        var requisition = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = laboratory.TenantId,
            LaboratoryId = laboratory.LaboratoryId,
            BranchId = msg.BranchId,
            VisitKey = msg.VisitKey,
            ExternalRequisitionId = msg.RequisitionId,
            CorrelationId = context.CorrelationId,
            AccessionNumber = accessionNumber,
            OrderingTenantId = from.TenantId,
            OrderingFacilityId = from.FacilityId,
            OrderingFacilityName = msg.OrderingFacilityName,
            OrderingDoctorName = msg.OrderingDoctor.DoctorName,
            OrderingDoctorPrc = msg.OrderingDoctor.PrcLicenseNumber,
            PatientId = msg.Patient.PatientId,
            PatientName = msg.Patient.FullName,
            PhilHealthPin = msg.Patient.PhilHealthPin,
            PatientAge = msg.Patient.Age,
            PatientGender = string.IsNullOrWhiteSpace(msg.Patient.Gender) ? "Unknown" : msg.Patient.Gender,
            ContactNumber = msg.Patient.ContactNumber,
            ClinicalDiagnosis = msg.ProvisionalDiagnosis,
            FastingInstructions = msg.FastingInstructions,
            Urgency = string.IsNullOrWhiteSpace(msg.Urgency) ? "Routine" : msg.Urgency,
            Status = RequisitionStatus.PendingAccession,
            PaymentPolicy = laboratory.PaymentPolicy
        };

        // Pre-create planned specimen containers based on requisition items
        int specimenIndex = 1;
        foreach (var item in msg.Items)
        {
            var (container, specType) = InferSpecimenContainer(item.ItemName, item.Category);

            // Check if container of same type already added for this order
            if (!requisition.Specimens.Any(s => s.ContainerType == container && s.SpecimenType == specType))
            {
                requisition.Specimens.Add(new Specimen
                {
                    Barcode = $"{accessionNumber}-S{specimenIndex:D2}",
                    ContainerType = container,
                    SpecimenType = specType,
                    Status = SpecimenStatus.Pending,
                    Notes = $"Required for test: {item.ItemName}"
                });
                specimenIndex++;
            }
        }

        // If no items were listed, provide default whole blood specimen
        if (requisition.Specimens.Count == 0)
        {
            requisition.Specimens.Add(new Specimen
            {
                Barcode = $"{accessionNumber}-S01",
                ContainerType = SpecimenContainerType.Purple_EDTA,
                SpecimenType = "WholeBlood",
                Status = SpecimenStatus.Pending,
                Notes = "Standard specimen collection"
            });
        }

        // Quote, invoice request and stage announcements are queued in the outbox BEFORE the save, so they exist if and
        // only if the requisition was committed.
        await _billing.RequestInvoiceAsync(requisition, msg.Items, ct);

        var namedThisLaboratory = string.Equals(msg.TargetFacilityId, to.FacilityId, StringComparison.OrdinalIgnoreCase);
        await _lifecycle.BeginAsync(
            requisition,
            namedThisLaboratory ? RequisitionStage.Routed : RequisitionStage.Claimed,
            ct);

        if (requisition.PaymentPolicy != PaymentPolicy.None)
        {
            await _lifecycle.TransitionAsync(requisition, RequisitionStage.AwaitingPayment, null, ct);
        }

        await _requisitionRepository.AddAsync(requisition, ct);

        if (requisition.HasClinicEzPatient && requisition.PatientId != Guid.Empty && _publisher != null)
        {
            var grantId = CommsGrantIdGenerator.Create(requisition.TenantId, requisition.LaboratoryId.ToString(), "LabRequisition", requisition.Id.ToString());
            var commsFrom = Party.ForFacility(requisition.TenantId, requisition.LaboratoryId.ToString(), FacilityType.Laboratory);
            var toParty = Party.ForFacility(requisition.TenantId, requisition.LaboratoryId.ToString(), FacilityType.Laboratory, service: InteropServices.Comms);
            var grantPayload = new CommsEligibilityGrantedPayload(
                GrantId: grantId,
                TenantId: requisition.TenantId,
                FacilityId: requisition.LaboratoryId.ToString(),
                FacilityType: "Laboratory",
                PatientId: requisition.PatientId,
                ContextType: "LabRequisition",
                ContextId: requisition.Id.ToString(),
                WindowStartUtc: DateTime.UtcNow,
                WindowEndUtc: DateTime.UtcNow.AddDays(14),
                Version: 1);
            _publisher.Enqueue(InteropTypes.CommsEligibilityGranted, commsFrom, toParty, correlationId: grantId, grantPayload);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[LabOrderIssuedHandler] Successfully ingested Requisition {AccessionNumber} into LaboratoryDb with {SpecimenCount} planned specimen(s).",
            requisition.AccessionNumber, requisition.Specimens.Count);
    }

    private static (SpecimenContainerType Container, string SpecimenType) InferSpecimenContainer(string itemName, string category)
    {
        var nameLower = itemName.ToLowerInvariant();
        var catLower = category.ToLowerInvariant();

        if (nameLower.Contains("cbc") || nameLower.Contains("complete blood") || nameLower.Contains("hemoglobin") || catLower.Contains("hematology"))
        {
            return (SpecimenContainerType.Purple_EDTA, "WholeBlood");
        }

        if (nameLower.Contains("urine") || nameLower.Contains("urinalysis"))
        {
            return (SpecimenContainerType.Urine_Cup, "Urine");
        }

        if (nameLower.Contains("stool") || nameLower.Contains("fecalysis") || nameLower.Contains("fecal"))
        {
            return (SpecimenContainerType.Stool_Vial, "Stool");
        }

        if (nameLower.Contains("coagulation") || nameLower.Contains("pt") || nameLower.Contains("aptt") || nameLower.Contains("inr"))
        {
            return (SpecimenContainerType.LightBlue_Citrate, "Plasma");
        }

        // Default chemistry, serology, lipid, renal, liver panels
        return (SpecimenContainerType.Yellow_SST, "Serum");
    }
}
