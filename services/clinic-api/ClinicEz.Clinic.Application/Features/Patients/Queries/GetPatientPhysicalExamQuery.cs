using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientPhysicalExamQuery(Guid PatientId) : IRequest<PatientPhysicalExamProfileDto>;

public sealed class GetPatientPhysicalExamQueryHandler : IRequestHandler<GetPatientPhysicalExamQuery, PatientPhysicalExamProfileDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhysicalExam> _physicalExamRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientPhysicalExamQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhysicalExam> physicalExamRepo,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _physicalExamRepo = physicalExamRepo;
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

        var exam = await _physicalExamRepo.Query(pe => pe.PatientId == request.PatientId)
            .OrderByDescending(pe => pe.ExamDate)
            .FirstOrDefaultAsync(cancellationToken);

        if (exam != null)
        {
            return new PatientPhysicalExamProfileDto(
                exam.Id,
                exam.PatientId,
                GenSurveyId: exam.GenSurveyId ?? (exam.GeneralSurveyStatus == GeneralSurveyStatus.Normal ? "1" : "2"),
                exam.GeneralSurveyRemarks,
                SkinId: exam.SkinId ?? "1",
                exam.SkinRemarks,
                HeentId: exam.HeentId ?? "11",
                exam.HeentRemarks,
                ChestId: exam.ChestId ?? "6",
                exam.ChestLungsRemarks,
                HeartId: exam.HeartId ?? "5",
                exam.HeartRemarks,
                AbdomenId: exam.AbdomenId ?? "7",
                exam.AbdomenRemarks,
                NeuroId: exam.NeuroId ?? "6",
                exam.NeurologicalRemarks,
                RectalId: exam.RectalId ?? "1",
                exam.DigitalRectalRemarks,
                GuId: exam.GuId ?? "1",
                exam.GenitourinaryRemarks,
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
