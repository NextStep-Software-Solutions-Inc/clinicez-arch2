using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientPhysicalExamQuery(Guid PatientId) : IRequest<PatientPhysicalExamProfileDto>;

public sealed class GetPatientPhysicalExamQueryHandler : IRequestHandler<GetPatientPhysicalExamQuery, PatientPhysicalExamProfileDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientPhysicalExamProfile> _physicalExamRepo;
    private readonly ILegacyPatientProfileIngestionService _legacyIngestion;
    private readonly IClinicContext _clinicContext;

    public GetPatientPhysicalExamQueryHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientPhysicalExamProfile> physicalExamRepo,
        ILegacyPatientProfileIngestionService legacyIngestion,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _physicalExamRepo = physicalExamRepo;
        _legacyIngestion = legacyIngestion;
        _clinicContext = clinicContext;
    }

    public async Task<PatientPhysicalExamProfileDto> Handle(GetPatientPhysicalExamQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);

        var exam = await _physicalExamRepo.Query(pe => pe.PatientId == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (exam != null)
        {
            return new PatientPhysicalExamProfileDto(
                exam.Id,
                exam.PatientId,
                exam.GenSurveyId,
                exam.GenSurveyRemarks,
                exam.SkinId,
                exam.SkinRemarks,
                exam.HeentId,
                exam.HeentRemarks,
                exam.ChestId,
                exam.ChestRemarks,
                exam.HeartId,
                exam.HeartRemarks,
                exam.AbdomenId,
                exam.AbdomenRemarks,
                exam.NeuroId,
                exam.NeuroRemarks,
                exam.RectalId,
                exam.RectalRemarks,
                exam.GuId,
                exam.GuRemarks,
                exam.CreatedAt,
                exam.UpdatedAt);
        }

        // Return statutory normal defaults when no record exists yet
        return new PatientPhysicalExamProfileDto(
            Id: Guid.Empty,
            PatientId: request.PatientId,
            GenSurveyId: "1",
            GenSurveyRemarks: null,
            SkinId: "1",
            SkinRemarks: null,
            HeentId: "11",
            HeentRemarks: null,
            ChestId: "6",
            ChestRemarks: null,
            HeartId: "5",
            HeartRemarks: null,
            AbdomenId: "7",
            AbdomenRemarks: null,
            NeuroId: "6",
            NeuroRemarks: null,
            RectalId: "1",
            RectalRemarks: null,
            GuId: "1",
            GuRemarks: null,
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: null);
    }
}
