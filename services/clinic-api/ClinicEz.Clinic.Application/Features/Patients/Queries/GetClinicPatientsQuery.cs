using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetClinicPatientsQuery(
    string? SearchTerm = null,
    bool? HasAlerts = null,
    string? VerificationStatus = null,
    int PageNumber = 1,
    int PageSize = 50) : IRequest<IReadOnlyList<ClinicPatientDto>>;

public sealed class GetClinicPatientsQueryHandler : IRequestHandler<GetClinicPatientsQuery, IReadOnlyList<ClinicPatientDto>>
{
    private readonly IRepository<ClinicPatient> _patientRepo;

    public GetClinicPatientsQueryHandler(IRepository<ClinicPatient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<IReadOnlyList<ClinicPatientDto>> Handle(GetClinicPatientsQuery request, CancellationToken ct)
    {
        IQueryable<ClinicPatient> query = _patientRepo.Query().AsNoTracking().Include(p => p.PastMedicalHistories);

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToLower();
            query = query.Where(p =>
                p.FirstName.ToLower().Contains(term) ||
                p.LastName.ToLower().Contains(term) ||
                p.PatientCode.ToLower().Contains(term) ||
                p.ContactNumber.Contains(term) ||
                (p.PhilHealthNumber != null && p.PhilHealthNumber.Contains(term)) ||
                (p.SeniorCitizenId != null && p.SeniorCitizenId.Contains(term)) ||
                (p.PwdId != null && p.PwdId.Contains(term)));
        }

        if (request.HasAlerts == true)
        {
            query = query.Where(p =>
                !string.IsNullOrWhiteSpace(p.Alerts) ||
                !string.IsNullOrWhiteSpace(p.Allergies));
        }

        if (!string.IsNullOrWhiteSpace(request.VerificationStatus))
        {
            query = query.Where(p => p.VerificationStatus == request.VerificationStatus);
        }

        var patients = await query
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .Skip((Math.Max(1, request.PageNumber) - 1) * Math.Max(1, request.PageSize))
            .Take(Math.Max(1, request.PageSize))
            .ToListAsync(ct);

        return patients.Select(RegisterClinicPatientCommandHandler.MapToDto).ToList().AsReadOnly();
    }
}
