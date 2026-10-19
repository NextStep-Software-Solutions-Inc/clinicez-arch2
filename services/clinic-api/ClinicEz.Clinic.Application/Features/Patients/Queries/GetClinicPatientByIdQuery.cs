using System;
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

public sealed record GetClinicPatientByIdQuery(Guid Id) : IRequest<ClinicPatientDto?>;

public sealed class GetClinicPatientByIdQueryHandler : IRequestHandler<GetClinicPatientByIdQuery, ClinicPatientDto?>
{
    private readonly IRepository<ClinicPatient> _patientRepo;

    public GetClinicPatientByIdQueryHandler(IRepository<ClinicPatient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<ClinicPatientDto?> Handle(GetClinicPatientByIdQuery request, CancellationToken ct)
    {
        var patient = await _patientRepo.Query()
            .AsNoTracking()
            .Include(p => p.PastMedicalHistories)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct);

        return patient == null ? null : RegisterClinicPatientCommandHandler.MapToDto(patient);
    }
}
