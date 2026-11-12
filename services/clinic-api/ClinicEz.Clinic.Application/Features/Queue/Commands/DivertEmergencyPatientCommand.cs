using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record DivertEmergencyPatientCommand(
    Guid QueueItemId,
    string DestinationHospital,
    string TransportMode,
    string ParamedicOrEscortName,
    string ClinicalHandoverSummary,
    Guid? DivertedByStaffId = null
) : IRequest<bool>;

public sealed class DivertEmergencyPatientCommandHandler : IRequestHandler<DivertEmergencyPatientCommand, bool>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ConsultationEncounter>? _consultationRepository;
    private readonly IRepository<EncounterDiagnosis>? _diagnosisRepository;
    private readonly IRepository<PrescriptionItem>? _prescriptionRepository;
    private readonly IRepository<EncounterReviewOfSystemsItem>? _rosRepository;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepository;
    private readonly IRepository<PatientPhysicalExamFinding>? _physicalExamFindingRepository;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepository;
    private readonly IRepository<MedicalCertificate>? _medCertRepository;
    private readonly IRepository<ReferralLetter>? _referralRepository;
    private readonly IRepository<LabOrder>? _labOrderRepository;
    private readonly IRepository<LabOrderItem>? _labOrderItemRepository;
    private readonly IRepository<UploadGrant>? _uploadGrantRepository;
    private readonly IRepository<DentalToothRecord>? _dentalRepository;
    private readonly IRepository<Procedure>? _procedureRepository;
    private readonly IRepository<Invoice>? _invoiceRepository;
    private readonly IRepository<InvoiceLineItem>? _invoiceLineItemRepository;

    public DivertEmergencyPatientCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<ConsultationEncounter>? consultationRepository = null,
        IRepository<EncounterDiagnosis>? diagnosisRepository = null,
        IRepository<PrescriptionItem>? prescriptionRepository = null,
        IRepository<EncounterReviewOfSystemsItem>? rosRepository = null,
        IRepository<PatientPhysicalExam>? physicalExamRepository = null,
        IRepository<PatientPhysicalExamFinding>? physicalExamFindingRepository = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepository = null,
        IRepository<MedicalCertificate>? medCertRepository = null,
        IRepository<ReferralLetter>? referralRepository = null,
        IRepository<LabOrder>? labOrderRepository = null,
        IRepository<LabOrderItem>? labOrderItemRepository = null,
        IRepository<UploadGrant>? uploadGrantRepository = null,
        IRepository<DentalToothRecord>? dentalRepository = null,
        IRepository<Procedure>? procedureRepository = null,
        IRepository<Invoice>? invoiceRepository = null,
        IRepository<InvoiceLineItem>? invoiceLineItemRepository = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _consultationRepository = consultationRepository;
        _diagnosisRepository = diagnosisRepository;
        _prescriptionRepository = prescriptionRepository;
        _rosRepository = rosRepository;
        _physicalExamRepository = physicalExamRepository;
        _physicalExamFindingRepository = physicalExamFindingRepository;
        _dispensingLogRepository = dispensingLogRepository;
        _medCertRepository = medCertRepository;
        _referralRepository = referralRepository;
        _labOrderRepository = labOrderRepository;
        _labOrderItemRepository = labOrderItemRepository;
        _uploadGrantRepository = uploadGrantRepository;
        _dentalRepository = dentalRepository;
        _procedureRepository = procedureRepository;
        _invoiceRepository = invoiceRepository;
        _invoiceLineItemRepository = invoiceLineItemRepository;
    }

    public async Task<bool> Handle(DivertEmergencyPatientCommand request, CancellationToken ct)
    {
        if (request.QueueItemId == Guid.Empty)
        {
            throw new BadRequestException("QueueItemId is required.");
        }

        if (string.IsNullOrWhiteSpace(request.DestinationHospital))
        {
            throw new BadRequestException("Destination hospital is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.TransportMode))
        {
            throw new BadRequestException("Transport mode is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.ParamedicOrEscortName))
        {
            throw new BadRequestException("Paramedic or escort name is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.ClinicalHandoverSummary))
        {
            throw new BadRequestException("Clinical handover summary is required for emergency diversion.");
        }

        var queueItem = await _queueRepository.GetByIdAsync(request.QueueItemId, ct)
            ?? throw new NotFoundException($"Queue item with ID '{request.QueueItemId}' not found.");

        if (_clinicContext.ClinicId != Guid.Empty && queueItem.ClinicId != _clinicContext.ClinicId)
        {
            throw new ForbiddenException("Queue item does not belong to the current clinic.");
        }

        if (queueItem.Status == QueueStatus.Completed ||
            queueItem.Status == QueueStatus.Cancelled ||
            queueItem.Status == QueueStatus.NoShow ||
            queueItem.Status == QueueStatus.DischargedNonDoctor ||
            queueItem.Status == QueueStatus.Diverted)
        {
            throw new BadRequestException($"Queue ticket is already closed with status '{queueItem.Status}'. Cannot divert.");
        }

        await ConsultationRevertHelper.PurgeUnsignedConsultationArtifactsAsync(
            queueItem.ClinicId,
            queueItemId: queueItem.Id,
            consultationRepo: _consultationRepository,
            diagnosisRepo: _diagnosisRepository,
            prescriptionRepo: _prescriptionRepository,
            rosRepo: _rosRepository,
            physicalExamRepo: _physicalExamRepository,
            physicalExamFindingRepo: _physicalExamFindingRepository,
            dispensingLogRepo: _dispensingLogRepository,
            medCertRepo: _medCertRepository,
            referralRepo: _referralRepository,
            labOrderRepo: _labOrderRepository,
            labOrderItemRepo: _labOrderItemRepository,
            uploadGrantRepo: _uploadGrantRepository,
            dentalRepo: _dentalRepository,
            procedureRepo: _procedureRepository,
            invoiceRepo: _invoiceRepository,
            invoiceLineItemRepo: _invoiceLineItemRepository,
            unitOfWork: _unitOfWork,
            ct: ct);

        var now = DateTime.UtcNow;
        var staffId = request.DivertedByStaffId ?? _clinicContext.StaffId;

        queueItem.Status = QueueStatus.Diverted;
        queueItem.DivertedToFacility = request.DestinationHospital.Trim();
        queueItem.TransportMode = request.TransportMode.Trim();
        queueItem.ParamedicOrEscortName = request.ParamedicOrEscortName.Trim();
        queueItem.HandoverSummary = request.ClinicalHandoverSummary.Trim();
        queueItem.DivertedAt = now;
        queueItem.DivertedByStaffId = staffId;
        queueItem.CompletedTime = now;
        queueItem.UpdatedAt = now;
        queueItem.UpdatedBy = staffId?.ToString() ?? "ClinicStaff";

        _queueRepository.Update(queueItem);
        await _unitOfWork.SaveChangesAsync(ct);

        return true;
    }
}
