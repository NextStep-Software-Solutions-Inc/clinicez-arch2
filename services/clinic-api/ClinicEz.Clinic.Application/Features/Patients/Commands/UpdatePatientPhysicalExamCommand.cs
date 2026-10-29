using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record UpdatePatientPhysicalExamCommand(
    Guid PatientId,
    string? GenSurveyId = null,
    string? GenSurveyRemarks = null,
    string? SkinId = null,
    string? SkinRemarks = null,
    string? HeentId = null,
    string? HeentRemarks = null,
    string? ChestId = null,
    string? ChestRemarks = null,
    string? HeartId = null,
    string? HeartRemarks = null,
    string? AbdomenId = null,
    string? AbdomenRemarks = null,
    string? NeuroId = null,
    string? NeuroRemarks = null,
    string? RectalId = null,
    string? RectalRemarks = null,
    string? GuId = null,
    string? GuRemarks = null) : IRequest<PatientPhysicalExamProfileDto>;

public sealed class UpdatePatientPhysicalExamCommandValidator : AbstractValidator<UpdatePatientPhysicalExamCommand>
{
    public UpdatePatientPhysicalExamCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class UpdatePatientPhysicalExamCommandHandler : IRequestHandler<UpdatePatientPhysicalExamCommand, PatientPhysicalExamProfileDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhysicalExam> _physicalExamRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientPhysicalExamCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhysicalExam> physicalExamRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _physicalExamRepo = physicalExamRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientPhysicalExamProfileDto> Handle(UpdatePatientPhysicalExamCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        var entry = await _physicalExamRepo.Query(pe => pe.PatientId == request.PatientId)
            .OrderByDescending(pe => pe.ExamDate)
            .FirstOrDefaultAsync(cancellationToken);

        var staffActor = _clinicContext.StaffId?.ToString() ?? "ClinicStaff";

        if (entry == null)
        {
            entry = new PatientPhysicalExam
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                GeneralSurveyStatus = (request.GenSurveyId == "2") ? GeneralSurveyStatus.Abnormal : GeneralSurveyStatus.Normal,
                GenSurveyId = request.GenSurveyId,
                GeneralSurveyRemarks = string.IsNullOrWhiteSpace(request.GenSurveyRemarks) ? null : request.GenSurveyRemarks.Trim(),
                SkinId = request.SkinId,
                SkinRemarks = string.IsNullOrWhiteSpace(request.SkinRemarks) ? null : request.SkinRemarks.Trim(),
                HeentId = request.HeentId,
                HeentRemarks = string.IsNullOrWhiteSpace(request.HeentRemarks) ? null : request.HeentRemarks.Trim(),
                ChestId = request.ChestId,
                ChestLungsRemarks = string.IsNullOrWhiteSpace(request.ChestRemarks) ? null : request.ChestRemarks.Trim(),
                HeartId = request.HeartId,
                HeartRemarks = string.IsNullOrWhiteSpace(request.HeartRemarks) ? null : request.HeartRemarks.Trim(),
                AbdomenId = request.AbdomenId,
                AbdomenRemarks = string.IsNullOrWhiteSpace(request.AbdomenRemarks) ? null : request.AbdomenRemarks.Trim(),
                NeuroId = request.NeuroId,
                NeurologicalRemarks = string.IsNullOrWhiteSpace(request.NeuroRemarks) ? null : request.NeuroRemarks.Trim(),
                RectalId = request.RectalId,
                DigitalRectalRemarks = string.IsNullOrWhiteSpace(request.RectalRemarks) ? null : request.RectalRemarks.Trim(),
                GuId = request.GuId,
                GenitourinaryRemarks = string.IsNullOrWhiteSpace(request.GuRemarks) ? null : request.GuRemarks.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = staffActor
            };
            await _physicalExamRepo.AddAsync(entry, cancellationToken);
        }
        else
        {
            if (request.GenSurveyId != null)
                entry.GenSurveyId = request.GenSurveyId;
            if (request.GenSurveyRemarks != null)
                entry.GeneralSurveyRemarks = string.IsNullOrWhiteSpace(request.GenSurveyRemarks) ? null : request.GenSurveyRemarks.Trim();

            if (request.SkinId != null)
                entry.SkinId = request.SkinId;
            if (request.SkinRemarks != null)
                entry.SkinRemarks = string.IsNullOrWhiteSpace(request.SkinRemarks) ? null : request.SkinRemarks.Trim();

            if (request.HeentId != null)
                entry.HeentId = request.HeentId;
            if (request.HeentRemarks != null)
                entry.HeentRemarks = string.IsNullOrWhiteSpace(request.HeentRemarks) ? null : request.HeentRemarks.Trim();

            if (request.ChestId != null)
                entry.ChestId = request.ChestId;
            if (request.ChestRemarks != null)
                entry.ChestLungsRemarks = string.IsNullOrWhiteSpace(request.ChestRemarks) ? null : request.ChestRemarks.Trim();

            if (request.HeartId != null)
                entry.HeartId = request.HeartId;
            if (request.HeartRemarks != null)
                entry.HeartRemarks = string.IsNullOrWhiteSpace(request.HeartRemarks) ? null : request.HeartRemarks.Trim();

            if (request.AbdomenId != null)
                entry.AbdomenId = request.AbdomenId;
            if (request.AbdomenRemarks != null)
                entry.AbdomenRemarks = string.IsNullOrWhiteSpace(request.AbdomenRemarks) ? null : request.AbdomenRemarks.Trim();

            if (request.NeuroId != null)
                entry.NeuroId = request.NeuroId;
            if (request.NeuroRemarks != null)
                entry.NeurologicalRemarks = string.IsNullOrWhiteSpace(request.NeuroRemarks) ? null : request.NeuroRemarks.Trim();

            if (request.RectalId != null)
                entry.RectalId = request.RectalId;
            if (request.RectalRemarks != null)
                entry.DigitalRectalRemarks = string.IsNullOrWhiteSpace(request.RectalRemarks) ? null : request.RectalRemarks.Trim();

            if (request.GuId != null)
                entry.GuId = request.GuId;
            if (request.GuRemarks != null)
                entry.GenitourinaryRemarks = string.IsNullOrWhiteSpace(request.GuRemarks) ? null : request.GuRemarks.Trim();

            entry.UpdatedAt = DateTime.UtcNow;
            entry.UpdatedBy = staffActor;
            _physicalExamRepo.Update(entry);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientPhysicalExamProfileDto(
            entry.Id,
            entry.PatientId,
            GenSurveyId: entry.GenSurveyId ?? "1",
            entry.GeneralSurveyRemarks,
            SkinId: entry.SkinId ?? "1",
            entry.SkinRemarks,
            HeentId: entry.HeentId ?? "11",
            entry.HeentRemarks,
            ChestId: entry.ChestId ?? "6",
            entry.ChestLungsRemarks,
            HeartId: entry.HeartId ?? "5",
            entry.HeartRemarks,
            AbdomenId: entry.AbdomenId ?? "7",
            entry.AbdomenRemarks,
            NeuroId: entry.NeuroId ?? "6",
            entry.NeurologicalRemarks,
            RectalId: entry.RectalId ?? "1",
            entry.DigitalRectalRemarks,
            GuId: entry.GuId ?? "1",
            entry.GenitourinaryRemarks,
            entry.CreatedAt,
            entry.UpdatedAt);
    }
}
