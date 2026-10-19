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

public sealed record GetPatientMedicalHistoryQuery(Guid PatientId) : IRequest<PatientMedicalHistoryResultDto>;

public sealed class GetPatientMedicalHistoryQueryHandler : IRequestHandler<GetPatientMedicalHistoryQuery, PatientMedicalHistoryResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientPastMedicalHistory> _medicalRepo;

    public GetPatientMedicalHistoryQueryHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientPastMedicalHistory> medicalRepo)
    {
        _patientRepo = patientRepo;
        _medicalRepo = medicalRepo;
    }

    public async Task<PatientMedicalHistoryResultDto> Handle(GetPatientMedicalHistoryQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with id {request.PatientId} not found.");
        }

        var entries = await _medicalRepo.Query(m => m.PatientId == request.PatientId)
            .OrderBy(m => m.ConditionTitle)
            .ToListAsync(cancellationToken);

        var dtos = entries.Select(e => new PatientPastMedicalHistoryDto(
            e.Id,
            e.PatientId,
            e.ConditionTitle,
            e.PhilHealthMdiseaseCode,
            e.Icd10Code,
            e.SpecificDescription,
            e.OnsetDate,
            e.IsResolved,
            e.ClinicalNotes,
            e.CreatedAt)).ToList();

        return new PatientMedicalHistoryResultDto(dtos, patient.PersonalMedicalHistoryNotes);
    }
}
