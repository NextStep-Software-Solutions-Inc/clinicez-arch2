using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Queries;

public sealed record GetConsultationsQuery(
    Guid? PatientId = null,
    Guid? DoctorId = null,
    bool? IsSigned = null) : IRequest<IReadOnlyList<ConsultationEncounterDto>>;

public sealed class GetConsultationsQueryHandler : IRequestHandler<GetConsultationsQuery, IReadOnlyList<ConsultationEncounterDto>>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IClinicContext _clinicContext;

    public GetConsultationsQueryHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ConsultationEncounterDto>> Handle(GetConsultationsQuery request, CancellationToken cancellationToken)
    {
        var query = _consultationRepository.Query(c => c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .AsQueryable();

        if (request.PatientId.HasValue)
        {
            query = query.Where(c => c.PatientId == request.PatientId.Value);
        }

        if (request.DoctorId.HasValue)
        {
            query = query.Where(c => c.DoctorId == request.DoctorId.Value);
        }

        if (request.IsSigned.HasValue)
        {
            query = query.Where(c => c.IsSigned == request.IsSigned.Value);
        }

        var list = await query
            .OrderByDescending(c => c.EncounterDate)
            .ToListAsync(cancellationToken);

        return list.Select(encounter => new ConsultationEncounterDto(
            encounter.Id,
            encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks, p.PhilHealthDrugCode)).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo
        )).ToList();
    }
}

public sealed record GetConsultationByIdQuery(Guid Id) : IRequest<ConsultationEncounterDto>;

public sealed class GetConsultationByIdQueryHandler : IRequestHandler<GetConsultationByIdQuery, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IClinicContext _clinicContext;

    public GetConsultationByIdQueryHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _clinicContext = clinicContext;
    }

    public async Task<ConsultationEncounterDto> Handle(GetConsultationByIdQuery request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository.Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Encounter '{request.Id}' was not found in this clinic.");
        }

        return new ConsultationEncounterDto(
            encounter.Id,
            encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks, p.PhilHealthDrugCode)).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo);
    }
}
