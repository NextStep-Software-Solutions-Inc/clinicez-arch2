using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientFamilyHistoryQuery(Guid PatientId) : IRequest<PatientFamilyHistoryResultDto>;

public sealed class GetPatientFamilyHistoryQueryHandler : IRequestHandler<GetPatientFamilyHistoryQuery, PatientFamilyHistoryResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientFamilyHistory> _familyRepo;

    public GetPatientFamilyHistoryQueryHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientFamilyHistory> familyRepo)
    {
        _patientRepo = patientRepo;
        _familyRepo = familyRepo;
    }

    public async Task<PatientFamilyHistoryResultDto> Handle(GetPatientFamilyHistoryQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with id {request.PatientId} not found.");
        }

        var entries = await _familyRepo.Query(f => f.PatientId == request.PatientId)
            .OrderBy(f => f.ConditionTitle)
            .ToListAsync(cancellationToken);

        var dtos = entries.Select(e => new PatientFamilyHistoryDto(
            e.Id,
            e.PatientId,
            e.ConditionTitle,
            e.PhilHealthMdiseaseCode,
            e.Icd10Code,
            e.SpecificDescription,
            e.Relationship,
            e.ClinicalNotes,
            e.CreatedAt)).ToList();

        return new PatientFamilyHistoryResultDto(dtos, patient.FamilyMedicalHistoryNotes);
    }
}
