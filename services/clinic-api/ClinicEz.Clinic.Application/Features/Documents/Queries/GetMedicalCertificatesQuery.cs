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

public sealed record GetMedicalCertificatesQuery(
    Guid? PatientId = null,
    Guid? DoctorId = null) : IRequest<IReadOnlyList<MedicalCertificateDto>>;

public sealed class GetMedicalCertificatesQueryHandler : IRequestHandler<GetMedicalCertificatesQuery, IReadOnlyList<MedicalCertificateDto>>
{
    private readonly IRepository<MedicalCertificate> _medCertRepo;

    public GetMedicalCertificatesQueryHandler(IRepository<MedicalCertificate> medCertRepo)
    {
        _medCertRepo = medCertRepo;
    }

    public async Task<IReadOnlyList<MedicalCertificateDto>> Handle(GetMedicalCertificatesQuery request, CancellationToken ct)
    {
        var query = _medCertRepo.Query().AsNoTracking();

        if (request.PatientId.HasValue)
        {
            query = query.Where(m => m.PatientId == request.PatientId.Value);
        }

        if (request.DoctorId.HasValue)
        {
            query = query.Where(m => m.DoctorId == request.DoctorId.Value);
        }

        var list = await query
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync(ct);

        return list.Select(cert => new MedicalCertificateDto(
            cert.Id,
            cert.TenantId,
            cert.ClinicId,
            cert.CertificateNumber,
            cert.PatientId,
            cert.PatientName,
            cert.ConsultationId,
            cert.DoctorId,
            cert.DoctorName,
            cert.PrcLicenseNumber,
            cert.PtrNumber,
            cert.IssueDate,
            cert.Diagnosis,
            cert.ClinicalFindings,
            cert.FitnessStatus,
            cert.RecommendedRestDays,
            cert.RestStartDate,
            cert.RestEndDate,
            cert.Purpose,
            cert.Remarks,
            cert.IsSigned,
            cert.SignedAt,
            cert.CreatedAt)).ToList().AsReadOnly();
    }
}
