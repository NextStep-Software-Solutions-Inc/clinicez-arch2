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
/// <c>lab.order.issued</c>: ingests a clinic's requisition into the laboratory worklist.
/// <list type="bullet">
/// <item>The envelope <c>To</c> must be a laboratory known here (tenant + facility); the requisition is created for
/// that laboratory, never for whatever the payload claims.</item>
/// <item>The envelope <c>From</c> (tenant + facility) is stored as the ordering party and the envelope correlation
/// id (the clinic's requisition id) is stored as well: results and panic alerts are addressed from them.</item>
/// <item>Idempotent per ordering facility and requisition id. Accession numbers are per-facility and are never used
/// to match requisitions across tenants.</item>
/// </list>
/// </summary>
public sealed class LabOrderIssuedHandler : IInteropHandler<LabRequisitionIssuedEvent>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IRepository<LabSettings> _settingsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<LabOrderIssuedHandler> _logger;

    public LabOrderIssuedHandler(
        IRepository<LabRequisition> requisitionRepository,
        IRepository<LabSettings> settingsRepository,
        IUnitOfWork unitOfWork,
        ILogger<LabOrderIssuedHandler> logger)
    {
        _requisitionRepository = requisitionRepository;
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
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
        if (to.Kind != PartyKind.Facility || !Guid.TryParse(to.FacilityId, out var laboratoryId))
        {
            _logger.LogWarning(
                "[LabOrderIssuedHandler] Ignoring lab.order.issued {MessageId}: {Recipient} is not a laboratory address.",
                context.MessageId, to.Address);
            return;
        }

        var laboratory = await _settingsRepository.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.LaboratoryId == laboratoryId, ct);

        // Not provisioned here (yet): fail so the hub redelivers rather than silently losing the order.
        if (laboratory == null)
        {
            throw new InvalidOperationException(
                $"Laboratory {laboratoryId} is not provisioned in this service; cannot accept lab.order.issued {context.MessageId}.");
        }

        if (!string.Equals(laboratory.TenantId, to.TenantId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[LabOrderIssuedHandler] Ignoring lab.order.issued {MessageId}: addressed to tenant {Tenant} but laboratory {LaboratoryId} belongs to another tenant.",
                context.MessageId, to.TenantId, laboratoryId);
            return;
        }

        _logger.LogInformation(
            "[LabOrderIssuedHandler] Received lab order {RequisitionId} (Accession {AccessionNumber}, Patient {PatientName}) from {Sender}",
            msg.RequisitionId, msg.AccessionNumber, msg.Patient.FullName, from.Address);

        var alreadyIngested = await _requisitionRepository.IgnoreQueryFilters()
            .AnyAsync(r =>
                r.LaboratoryId == laboratory.LaboratoryId
                && r.OrderingTenantId == from.TenantId
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
        // laboratory, otherwise make it unique here so another tenant's order is never dropped or merged.
        var accessionNumber = msg.AccessionNumber;
        if (await _requisitionRepository.IgnoreQueryFilters().AnyAsync(r => r.AccessionNumber == accessionNumber, ct))
        {
            accessionNumber = $"{msg.AccessionNumber}-{msg.RequisitionId.ToString("N")[..8]}";
        }

        var requisition = new LabRequisition
        {
            TenantId = laboratory.TenantId,
            LaboratoryId = laboratory.LaboratoryId,
            BranchId = msg.BranchId,
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
            Status = RequisitionStatus.PendingAccession
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

        await _requisitionRepository.AddAsync(requisition, ct);
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
