using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Documents.Queries;

public sealed record GetReferralLettersQuery(
    Guid? PatientId = null,
    Guid? ReferringDoctorId = null) : IRequest<IReadOnlyList<ReferralLetterDto>>;

public sealed class GetReferralLettersQueryHandler : IRequestHandler<GetReferralLettersQuery, IReadOnlyList<ReferralLetterDto>>
{
    private readonly IRepository<ReferralLetter> _referralRepo;

    public GetReferralLettersQueryHandler(IRepository<ReferralLetter> referralRepo)
    {
        _referralRepo = referralRepo;
    }

    public async Task<IReadOnlyList<ReferralLetterDto>> Handle(GetReferralLettersQuery request, CancellationToken ct)
    {
        var query = _referralRepo.Query().AsNoTracking();

        if (request.PatientId.HasValue)
        {
            query = query.Where(r => r.PatientId == request.PatientId.Value);
        }

        if (request.ReferringDoctorId.HasValue)
        {
            query = query.Where(r => r.ReferringDoctorId == request.ReferringDoctorId.Value);
        }

        var list = await query
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        return list.Select(referral => new ReferralLetterDto(
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
            referral.CreatedAt)).ToList().AsReadOnly();
    }
}
