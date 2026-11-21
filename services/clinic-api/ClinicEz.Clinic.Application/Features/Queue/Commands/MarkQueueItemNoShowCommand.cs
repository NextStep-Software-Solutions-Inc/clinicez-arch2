using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record MarkQueueItemNoShowCommand(Guid Id) : IRequest<QueueItemDto>;

public sealed class MarkQueueItemNoShowCommandHandler : IRequestHandler<MarkQueueItemNoShowCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly Features.Queue.Services.IQueueNotificationDispatcher? _notificationDispatcher;
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

    public MarkQueueItemNoShowCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Features.Queue.Services.IQueueNotificationDispatcher? notificationDispatcher = null,
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
        _notificationDispatcher = notificationDispatcher;
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

    public async Task<QueueItemDto> Handle(MarkQueueItemNoShowCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.PatientVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        await ConsultationRevertHelper.PurgeUnsignedConsultationArtifactsAsync(
            _clinicContext.ClinicId,
            queueItemId: item.Id,
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
            ct: cancellationToken);

        item.Status = QueueStatus.NoShow;
        item.CompletedTime = DateTime.UtcNow;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Staff";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return item.ToDto();
    }
}
