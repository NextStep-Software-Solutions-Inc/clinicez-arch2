using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Domain.Entities;
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
    string? AttachedDiagnostics = null) : IRequest<ReferralLetterDto>;

public sealed class IssueReferralLetterCommandHandler : IRequestHandler<IssueReferralLetterCommand, ReferralLetterDto>
{
    private readonly IRepository<ReferralLetter> _referralRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IDocumentSecurityService _security;
    private readonly IRepository<StaffMember>? _staffRepo;

    public IssueReferralLetterCommandHandler(
        IRepository<ReferralLetter> referralRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IDocumentSecurityService? security = null,
        IRepository<StaffMember>? staffRepo = null)
    {
        _referralRepo = referralRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _security = security ?? new DocumentSecurityService();
        _staffRepo = staffRepo;
    }

    public async Task<ReferralLetterDto> Handle(IssueReferralLetterCommand request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var datePrefix = today.ToString("yyyyMMdd");

        var count = await _referralRepo.Query()
            .CountAsync(r => r.ReferralDate == today, ct);

        var refNumber = $"REF-{datePrefix}-{(count + 1):D4}";

        var issuedAt = DateTime.UtcNow;
        var doctor = _staffRepo != null ? await _staffRepo.GetByIdAsync(request.ReferringDoctorId, ct) : null;
        var prcNumber = doctor?.PrcLicenseNumber ?? "PRC-DOCTOR";

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ReferralNumber = refNumber,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            ConsultationId = request.ConsultationId,
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
            IsSigned = true,
            SignedAt = issuedAt,
            CreatedAt = issuedAt,
            CreatedBy = request.ReferringDoctorName
        };

        var digest = _security.ComputeDocumentDigest(
            referral.TenantId, "REFERRAL", referral.ReferralNumber, referral.PatientId, referral.ReferringDoctorPrcNumber, issuedAt);
        referral.SecurityDigest = digest;

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
            referral.CreatedAt);
    }
}
