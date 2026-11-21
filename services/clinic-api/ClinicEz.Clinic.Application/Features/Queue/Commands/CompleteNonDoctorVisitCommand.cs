using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record CompleteNonDoctorVisitCommand(
    Guid QueueItemId,
    string? DischargeRemarks = null
) : IRequest<bool>;

public sealed class CompleteNonDoctorVisitCommandValidator : AbstractValidator<CompleteNonDoctorVisitCommand>
{
    public CompleteNonDoctorVisitCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        RuleFor(x => x.DischargeRemarks).MaximumLength(1000);
    }
}

public sealed class CompleteNonDoctorVisitCommandHandler : IRequestHandler<CompleteNonDoctorVisitCommand, bool>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IQueueNotificationDispatcher? _notificationDispatcher;
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

    public CompleteNonDoctorVisitCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IQueueNotificationDispatcher? notificationDispatcher = null,
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

    public async Task<bool> Handle(CompleteNonDoctorVisitCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.QueueItemId}' was not found in this clinic.");
        }

        // Terminal statuses cannot be discharged again
        if (item.Status == QueueStatus.Completed ||
            item.Status == QueueStatus.Cancelled ||
            item.Status == QueueStatus.NoShow ||
            item.Status == QueueStatus.DischargedNonDoctor ||
            item.Status == QueueStatus.Diverted)
        {
            throw new ConflictException($"Queue item '{request.QueueItemId}' is already in a terminal state ({item.Status}) and cannot be discharged.");
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

        var now = DateTime.UtcNow;
        var staffId = _clinicContext.StaffId;

        item.Status = QueueStatus.DischargedNonDoctor;
        item.CompletedTime = now;
        item.DischargedAt = now;
        item.DischargeNotes = request.DischargeRemarks;
        item.DischargedByStaffId = staffId;
        item.UpdatedAt = now;
        item.UpdatedBy = staffId?.ToString() ?? "Staff";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
