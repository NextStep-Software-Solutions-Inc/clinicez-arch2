using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Consumers;

public class LabRequisitionIssuedConsumer : IConsumer<LabRequisitionIssuedEvent>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<LabRequisitionIssuedConsumer> _logger;

    public LabRequisitionIssuedConsumer(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILogger<LabRequisitionIssuedConsumer> logger)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<LabRequisitionIssuedEvent> context)
    {
        var msg = context.Message;
        _logger.LogInformation(
            "[LabRequisitionIssuedConsumer] Received LabRequisitionIssuedEvent: AccessionNumber={AccessionNumber}, Patient={PatientName}, Facility={FacilityName}",
            msg.AccessionNumber, msg.Patient.FullName, msg.OrderingFacilityName);

        // Check idempotency
        var existing = await _requisitionRepository.FindAsync(
            r => r.ExternalRequisitionId == msg.RequisitionId || r.AccessionNumber == msg.AccessionNumber,
            context.CancellationToken);

        if (existing != null)
        {
            _logger.LogInformation(
                "[LabRequisitionIssuedConsumer] Requisition {AccessionNumber} already exists in LaboratoryDb. Skipping insertion.",
                msg.AccessionNumber);
            return;
        }

        var requisition = new LabRequisition
        {
            TenantId = !string.IsNullOrWhiteSpace(msg.TargetTenantId) ? msg.TargetTenantId : (!string.IsNullOrWhiteSpace(msg.TenantId) ? msg.TenantId : "default"),
            BranchId = msg.BranchId,
            ExternalRequisitionId = msg.RequisitionId,
            AccessionNumber = msg.AccessionNumber,
            OrderingFacilityId = msg.OrderingFacilityId,
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
                    Barcode = $"{msg.AccessionNumber}-S{specimenIndex:D2}",
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
                Barcode = $"{msg.AccessionNumber}-S01",
                ContainerType = SpecimenContainerType.Purple_EDTA,
                SpecimenType = "WholeBlood",
                Status = SpecimenStatus.Pending,
                Notes = "Standard specimen collection"
            });
        }

        await _requisitionRepository.AddAsync(requisition, context.CancellationToken);
        await _unitOfWork.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation(
            "[LabRequisitionIssuedConsumer] Successfully ingested Requisition {AccessionNumber} into LaboratoryDb with {SpecimenCount} planned specimen(s).",
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
