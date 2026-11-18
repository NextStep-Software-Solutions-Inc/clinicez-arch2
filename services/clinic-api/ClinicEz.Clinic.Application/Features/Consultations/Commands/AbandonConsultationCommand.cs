using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record AbandonConsultationCommand(
    Guid Id,
    string? Reason = null,
    bool CancelVisit = false) : IRequest<bool>;

public sealed class AbandonConsultationCommandValidator : AbstractValidator<AbandonConsultationCommand>
{
    public AbandonConsultationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}

public sealed class AbandonConsultationCommandHandler : IRequestHandler<AbandonConsultationCommand, bool>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
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

    public AbandonConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
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
        _consultationRepository = consultationRepository;
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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

    public async Task<bool> Handle(AbandonConsultationCommand request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository
            .Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Consultation encounter '{request.Id}' was not found in this clinic.");
        }

        if (encounter.IsSigned)
        {
            throw new BadRequestException("Signed consultation encounters are clinically locked and cannot be abandoned or reverted.");
        }

        var linkedQueueItemId = encounter.QueueItemId;

        await ConsultationRevertHelper.PurgeUnsignedConsultationArtifactsAsync(
            _clinicContext.ClinicId,
            consultationId: encounter.Id,
            queueItemId: linkedQueueItemId,
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

        if (linkedQueueItemId.HasValue)
        {
            var queueItem = await _queueRepository
                .Query(q => q.Id == linkedQueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .Include(q => q.PatientVitals)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null && queueItem.Status != QueueStatus.Completed)
            {
                if (request.CancelVisit)
                {
                    var repoProvider = _unitOfWork as IRepositoryProvider;
                    var dispRepo = _dispensingLogRepository ?? repoProvider?.GetRepository<ClinicDispensingLog>();
                    var vitalsRepo = repoProvider?.GetRepository<PatientVitals>();
                    var consultRepo = _consultationRepository ?? repoProvider?.GetRepository<ConsultationEncounter>();
                    var procRepo = _procedureRepository ?? repoProvider?.GetRepository<Procedure>();
                    var invoiceRepo = _invoiceRepository ?? repoProvider?.GetRepository<Invoice>();
                    var labRepo = _labOrderRepository ?? repoProvider?.GetRepository<LabOrder>();
                    var medCertRepo = _medCertRepository ?? repoProvider?.GetRepository<MedicalCertificate>();
                    var referralRepo = _referralRepository ?? repoProvider?.GetRepository<ReferralLetter>();

                    bool hasRemainingDispenseFk = dispRepo != null &&
                        await dispRepo.Query(d => d.QueueItemId == queueItem.Id)
                            .IgnoreQueryFilters()
                            .AnyAsync(d => !(d.Source == ClinicDispenseSource.DoctorConsultation &&
                                             (d.ConsultationEncounterId == encounter.Id ||
                                              (!d.IsConsultationValidated && d.QueueItemId == queueItem.Id))),
                                cancellationToken);

                    bool hasAnyVitalsFk = queueItem.PatientVitals != null ||
                        (vitalsRepo != null && await vitalsRepo.Query(v => v.QueueItemId == queueItem.Id).IgnoreQueryFilters().AnyAsync(cancellationToken));

                    bool hasOtherConsultationFk = consultRepo != null &&
                        await consultRepo.Query(c => c.QueueItemId == queueItem.Id && c.Id != encounter.Id).IgnoreQueryFilters().AnyAsync(cancellationToken);

                    bool hasRemainingProcedureFk = procRepo != null &&
                        await procRepo.Query(p => p.QueueItemId == queueItem.Id)
                            .IgnoreQueryFilters()
                            .AnyAsync(p => p.Status == ProcedureStatus.Completed || p.IsDeleted ||
                                           (p.ConsultationId != encounter.Id && p.ConsultationId != null),
                                cancellationToken);

                    bool hasRemainingInvoiceFk = invoiceRepo != null &&
                        await invoiceRepo.Query(i => i.QueueItemId == queueItem.Id)
                            .IgnoreQueryFilters()
                            .AnyAsync(i => i.AmountPaid > 0 || i.Status == InvoiceStatus.Paid || i.Status == InvoiceStatus.PartiallyPaid || i.IsDeleted ||
                                           (i.ConsultationId != encounter.Id && i.ConsultationId != null),
                                cancellationToken);

                    bool hasRemainingSignedArtifacts =
                        (labRepo != null && await labRepo.Query(l => l.QueueItemId == queueItem.Id && (l.IsSigned || l.IsDeleted)).IgnoreQueryFilters().AnyAsync(cancellationToken)) ||
                        (medCertRepo != null && await medCertRepo.Query(m => m.QueueItemId == queueItem.Id && (m.IsSigned || m.IsDeleted)).IgnoreQueryFilters().AnyAsync(cancellationToken)) ||
                        (referralRepo != null && await referralRepo.Query(r => r.QueueItemId == queueItem.Id && (r.IsSigned || r.IsDeleted)).IgnoreQueryFilters().AnyAsync(cancellationToken));

                    if (queueItem.IsDirectVisit &&
                        !hasAnyVitalsFk &&
                        !hasRemainingDispenseFk &&
                        !hasOtherConsultationFk &&
                        !hasRemainingProcedureFk &&
                        !hasRemainingInvoiceFk &&
                        !hasRemainingSignedArtifacts)
                    {
                        _queueRepository.Remove(queueItem, hardDelete: true);
                    }
                    else
                    {
                        queueItem.Status = QueueStatus.Cancelled;
                        queueItem.CompletedTime = DateTime.UtcNow;
                        queueItem.DischargeNotes = string.IsNullOrWhiteSpace(request.Reason)
                            ? "Consultation draft abandoned."
                            : request.Reason.Trim();
                        queueItem.UpdatedAt = DateTime.UtcNow;
                        _queueRepository.Update(queueItem);
                    }
                }
                else if (queueItem.Status == QueueStatus.InConsultation || queueItem.Status == QueueStatus.ReEvaluation)
                {
                    var vitalsRepo = (_unitOfWork as IRepositoryProvider)?.GetRepository<PatientVitals>();
                    bool hasVitals = queueItem.PatientVitals != null ||
                        (vitalsRepo != null && await vitalsRepo.Query(v => v.QueueItemId == queueItem.Id && !v.IsDeleted).AnyAsync(cancellationToken));
                    queueItem.Status = hasVitals ? QueueStatus.Triaged : QueueStatus.Waiting;
                    queueItem.UpdatedAt = DateTime.UtcNow;
                    _queueRepository.Update(queueItem);
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
