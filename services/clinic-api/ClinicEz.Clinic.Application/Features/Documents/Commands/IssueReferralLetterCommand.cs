using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Documents.Commands;

public sealed record IssueReferralLetterCommand(
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid ReferringDoctorId,
    string ReferringDoctorName,
    string? ReferredToDoctor,
    string ReferredToFacility,
    string ReferredDepartment,
    string Urgency,
    string ReasonForReferral,
    string ProvisionalDiagnosis,
    string ClinicalSummary,
    string? CurrentMedications = null,
    string? AttachedDiagnostics = null,
    Guid? QueueItemId = null) : IRequest<ReferralLetterDto>;

public sealed class IssueReferralLetterCommandHandler : IRequestHandler<IssueReferralLetterCommand, ReferralLetterDto>
{
    private readonly IRepository<ReferralLetter> _referralRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IDocumentSecurityService _security;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<ConsultationEncounter>? _consultationRepo;
    private readonly IRepository<QueueItem>? _queueRepo;

    public IssueReferralLetterCommandHandler(
        IRepository<ReferralLetter> referralRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IDocumentSecurityService? security = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<ConsultationEncounter>? consultationRepo = null,
        IRepository<QueueItem>? queueRepo = null)
    {
        _referralRepo = referralRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _security = security ?? new DocumentSecurityService();
        _staffRepo = staffRepo;
        _consultationRepo = consultationRepo;
        _queueRepo = queueRepo;
    }

    public async Task<ReferralLetterDto> Handle(IssueReferralLetterCommand request, CancellationToken ct)
    {
        Guid? resolvedConsultationId = request.ConsultationId;
        Guid? resolvedQueueItemId = request.QueueItemId;
        bool isPendingConsultationSignOff = false;

        if (resolvedConsultationId.HasValue && _consultationRepo != null)
        {
            var encounter = await _consultationRepo
                .Query(c => c.Id == resolvedConsultationId.Value && c.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);

            if (encounter != null)
            {
                resolvedQueueItemId ??= encounter.QueueItemId;
                if (!encounter.IsSigned)
                {
                    isPendingConsultationSignOff = true;
                }
            }
        }

        if (!isPendingConsultationSignOff && resolvedQueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo
                .Query(q => q.Id == resolvedQueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);

            if (queueItem != null && queueItem.VisitType.IsPhysicianConsultation())
            {
                if (_consultationRepo != null)
                {
                    var linkedConsultation = await _consultationRepo
                        .Query(c => c.QueueItemId == queueItem.Id && c.ClinicId == _clinicContext.ClinicId)
                        .OrderByDescending(c => c.EncounterDate)
                        .FirstOrDefaultAsync(ct);

                    if (linkedConsultation != null)
                    {
                        resolvedConsultationId ??= linkedConsultation.Id;
                        if (!linkedConsultation.IsSigned)
                        {
                            isPendingConsultationSignOff = true;
                        }
                    }
                    else if (!queueItem.IsDirectVisit)
                    {
                        isPendingConsultationSignOff = true;
                    }
                }
                else
                {
                    isPendingConsultationSignOff = queueItem.Status != QueueStatus.Completed;
                }
            }
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var datePrefix = today.ToString("yyyyMMdd");

        var count = await _referralRepo.Query()
            .CountAsync(r => r.ReferralDate == today, ct);

        var refNumber = $"REF-{datePrefix}-{(count + 1):D4}";

        var issuedAt = DateTime.UtcNow;
        var doctor = _staffRepo != null ? await _staffRepo.GetByIdAsync(request.ReferringDoctorId, ct) : null;
        var prcNumber = doctor?.PrcLicenseNumber ?? "PRC-DOCTOR";

        if (isPendingConsultationSignOff && resolvedConsultationId.HasValue)
        {
            var existingDraft = await _referralRepo.Query(r =>
                    r.ClinicId == _clinicContext.ClinicId &&
                    !r.IsSigned &&
                    (r.ConsultationId == resolvedConsultationId.Value ||
                     (resolvedQueueItemId.HasValue && r.QueueItemId == resolvedQueueItemId.Value)))
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (existingDraft != null)
            {
                existingDraft.ConsultationId = resolvedConsultationId;
                existingDraft.QueueItemId ??= resolvedQueueItemId;
                existingDraft.PatientId = request.PatientId;
                existingDraft.PatientName = request.PatientName.Trim();
                existingDraft.ReferringDoctorId = request.ReferringDoctorId;
                existingDraft.ReferringDoctorName = request.ReferringDoctorName.Trim();
                existingDraft.ReferringDoctorPrcNumber = prcNumber;
                existingDraft.ReferredToDoctor = request.ReferredToDoctor?.Trim();
                existingDraft.ReferredToFacility = request.ReferredToFacility.Trim();
                existingDraft.ReferredDepartment = request.ReferredDepartment.Trim();
                existingDraft.Urgency = string.IsNullOrWhiteSpace(request.Urgency) ? "Routine" : request.Urgency;
                existingDraft.ReasonForReferral = request.ReasonForReferral.Trim();
                existingDraft.ProvisionalDiagnosis = request.ProvisionalDiagnosis.Trim();
                existingDraft.ClinicalSummary = request.ClinicalSummary.Trim();
                existingDraft.CurrentMedications = request.CurrentMedications?.Trim();
                existingDraft.AttachedDiagnostics = request.AttachedDiagnostics?.Trim();
                existingDraft.UpdatedAt = issuedAt;
                existingDraft.UpdatedBy = request.ReferringDoctorName.Trim();

                _referralRepo.Update(existingDraft);
                await _unitOfWork.SaveChangesAsync(ct);

                return new ReferralLetterDto(
                    existingDraft.Id,
                    existingDraft.TenantId,
                    existingDraft.ClinicId,
                    existingDraft.ReferralNumber,
                    existingDraft.PatientId,
                    existingDraft.PatientName,
                    existingDraft.ConsultationId,
                    existingDraft.ReferringDoctorId,
                    existingDraft.ReferringDoctorName,
                    existingDraft.ReferredToDoctor,
                    existingDraft.ReferredToFacility,
                    existingDraft.ReferredDepartment,
                    existingDraft.ReferralDate,
                    existingDraft.Urgency,
                    existingDraft.ReasonForReferral,
                    existingDraft.ProvisionalDiagnosis,
                    existingDraft.ClinicalSummary,
                    existingDraft.CurrentMedications,
                    existingDraft.AttachedDiagnostics,
                    existingDraft.IsSigned,
                    existingDraft.SignedAt,
                    existingDraft.CreatedAt,
                    existingDraft.SecurityDigest,
                    existingDraft.QueueItemId);
            }
        }

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ReferralNumber = refNumber,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            ConsultationId = resolvedConsultationId,
            QueueItemId = resolvedQueueItemId,
            ReferringDoctorId = request.ReferringDoctorId,
            ReferringDoctorName = request.ReferringDoctorName.Trim(),
            ReferringDoctorPrcNumber = prcNumber,
            ReferredToDoctor = request.ReferredToDoctor?.Trim(),
            ReferredToFacility = request.ReferredToFacility.Trim(),
            ReferredDepartment = request.ReferredDepartment.Trim(),
            ReferralDate = today,
            Urgency = string.IsNullOrWhiteSpace(request.Urgency) ? "Routine" : request.Urgency,
            ReasonForReferral = request.ReasonForReferral.Trim(),
            ProvisionalDiagnosis = request.ProvisionalDiagnosis.Trim(),
            ClinicalSummary = request.ClinicalSummary.Trim(),
            CurrentMedications = request.CurrentMedications?.Trim(),
            AttachedDiagnostics = request.AttachedDiagnostics?.Trim(),
            IsSigned = !isPendingConsultationSignOff,
            SignedAt = isPendingConsultationSignOff ? null : issuedAt,
            CreatedAt = issuedAt,
            CreatedBy = request.ReferringDoctorName
        };

        if (referral.IsSigned)
        {
            var digest = _security.ComputeDocumentDigest(
                referral.TenantId, "REFERRAL", referral.ReferralNumber, referral.PatientId, referral.ReferringDoctorPrcNumber, issuedAt);
            referral.SecurityDigest = digest;
        }

        await _referralRepo.AddAsync(referral, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ReferralLetterDto(
            referral.Id,
            referral.TenantId,
            referral.ClinicId,
            referral.ReferralNumber,
            referral.PatientId,
            referral.PatientName,
            referral.ConsultationId,
            referral.ReferringDoctorId,
            referral.ReferringDoctorName,
            referral.ReferredToDoctor,
            referral.ReferredToFacility,
            referral.ReferredDepartment,
            referral.ReferralDate,
            referral.Urgency,
            referral.ReasonForReferral,
            referral.ProvisionalDiagnosis,
            referral.ClinicalSummary,
            referral.CurrentMedications,
            referral.AttachedDiagnostics,
            referral.IsSigned,
            referral.SignedAt,
            referral.CreatedAt,
            referral.SecurityDigest,
            referral.QueueItemId);
    }
}
