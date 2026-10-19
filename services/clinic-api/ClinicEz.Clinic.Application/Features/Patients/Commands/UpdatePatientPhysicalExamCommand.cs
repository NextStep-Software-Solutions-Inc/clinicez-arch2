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
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientPhysicalExamProfile> _physicalExamRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientPhysicalExamCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientPhysicalExamProfile> physicalExamRepo,
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
            .FirstOrDefaultAsync(cancellationToken);

        var staffActor = _clinicContext.StaffId?.ToString() ?? "ClinicStaff";

        if (entry == null)
        {
            entry = new PatientPhysicalExamProfile
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                GenSurveyId = !string.IsNullOrWhiteSpace(request.GenSurveyId) ? request.GenSurveyId : "1",
                GenSurveyRemarks = string.IsNullOrWhiteSpace(request.GenSurveyRemarks) ? null : request.GenSurveyRemarks.Trim(),
                SkinId = !string.IsNullOrWhiteSpace(request.SkinId) ? request.SkinId : "1",
                SkinRemarks = string.IsNullOrWhiteSpace(request.SkinRemarks) ? null : request.SkinRemarks.Trim(),
                HeentId = !string.IsNullOrWhiteSpace(request.HeentId) ? request.HeentId : "11",
                HeentRemarks = string.IsNullOrWhiteSpace(request.HeentRemarks) ? null : request.HeentRemarks.Trim(),
                ChestId = !string.IsNullOrWhiteSpace(request.ChestId) ? request.ChestId : "6",
                ChestRemarks = string.IsNullOrWhiteSpace(request.ChestRemarks) ? null : request.ChestRemarks.Trim(),
                HeartId = !string.IsNullOrWhiteSpace(request.HeartId) ? request.HeartId : "5",
                HeartRemarks = string.IsNullOrWhiteSpace(request.HeartRemarks) ? null : request.HeartRemarks.Trim(),
                AbdomenId = !string.IsNullOrWhiteSpace(request.AbdomenId) ? request.AbdomenId : "7",
                AbdomenRemarks = string.IsNullOrWhiteSpace(request.AbdomenRemarks) ? null : request.AbdomenRemarks.Trim(),
                NeuroId = !string.IsNullOrWhiteSpace(request.NeuroId) ? request.NeuroId : "6",
                NeuroRemarks = string.IsNullOrWhiteSpace(request.NeuroRemarks) ? null : request.NeuroRemarks.Trim(),
                RectalId = !string.IsNullOrWhiteSpace(request.RectalId) ? request.RectalId : "1",
                RectalRemarks = string.IsNullOrWhiteSpace(request.RectalRemarks) ? null : request.RectalRemarks.Trim(),
                GuId = !string.IsNullOrWhiteSpace(request.GuId) ? request.GuId : "1",
                GuRemarks = string.IsNullOrWhiteSpace(request.GuRemarks) ? null : request.GuRemarks.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = staffActor
            };
            await _physicalExamRepo.AddAsync(entry, cancellationToken);
        }
        else
        {
            if (request.GenSurveyId != null)
                entry.GenSurveyId = !string.IsNullOrWhiteSpace(request.GenSurveyId) ? request.GenSurveyId : "1";
            if (request.GenSurveyRemarks != null)
                entry.GenSurveyRemarks = string.IsNullOrWhiteSpace(request.GenSurveyRemarks) ? null : request.GenSurveyRemarks.Trim();

            if (request.SkinId != null)
                entry.SkinId = !string.IsNullOrWhiteSpace(request.SkinId) ? request.SkinId : "1";
            if (request.SkinRemarks != null)
                entry.SkinRemarks = string.IsNullOrWhiteSpace(request.SkinRemarks) ? null : request.SkinRemarks.Trim();

            if (request.HeentId != null)
                entry.HeentId = !string.IsNullOrWhiteSpace(request.HeentId) ? request.HeentId : "11";
            if (request.HeentRemarks != null)
                entry.HeentRemarks = string.IsNullOrWhiteSpace(request.HeentRemarks) ? null : request.HeentRemarks.Trim();

            if (request.ChestId != null)
                entry.ChestId = !string.IsNullOrWhiteSpace(request.ChestId) ? request.ChestId : "6";
            if (request.ChestRemarks != null)
                entry.ChestRemarks = string.IsNullOrWhiteSpace(request.ChestRemarks) ? null : request.ChestRemarks.Trim();

            if (request.HeartId != null)
                entry.HeartId = !string.IsNullOrWhiteSpace(request.HeartId) ? request.HeartId : "5";
            if (request.HeartRemarks != null)
                entry.HeartRemarks = string.IsNullOrWhiteSpace(request.HeartRemarks) ? null : request.HeartRemarks.Trim();

            if (request.AbdomenId != null)
                entry.AbdomenId = !string.IsNullOrWhiteSpace(request.AbdomenId) ? request.AbdomenId : "7";
            if (request.AbdomenRemarks != null)
                entry.AbdomenRemarks = string.IsNullOrWhiteSpace(request.AbdomenRemarks) ? null : request.AbdomenRemarks.Trim();

            if (request.NeuroId != null)
                entry.NeuroId = !string.IsNullOrWhiteSpace(request.NeuroId) ? request.NeuroId : "6";
            if (request.NeuroRemarks != null)
                entry.NeuroRemarks = string.IsNullOrWhiteSpace(request.NeuroRemarks) ? null : request.NeuroRemarks.Trim();

            if (request.RectalId != null)
                entry.RectalId = !string.IsNullOrWhiteSpace(request.RectalId) ? request.RectalId : "1";
            if (request.RectalRemarks != null)
                entry.RectalRemarks = string.IsNullOrWhiteSpace(request.RectalRemarks) ? null : request.RectalRemarks.Trim();

            if (request.GuId != null)
                entry.GuId = !string.IsNullOrWhiteSpace(request.GuId) ? request.GuId : "1";
            if (request.GuRemarks != null)
                entry.GuRemarks = string.IsNullOrWhiteSpace(request.GuRemarks) ? null : request.GuRemarks.Trim();

            entry.UpdatedAt = DateTime.UtcNow;
            entry.UpdatedBy = staffActor;
            _physicalExamRepo.Update(entry);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientPhysicalExamProfileDto(
            entry.Id,
            entry.PatientId,
            entry.GenSurveyId,
            entry.GenSurveyRemarks,
            entry.SkinId,
            entry.SkinRemarks,
            entry.HeentId,
            entry.HeentRemarks,
            entry.ChestId,
            entry.ChestRemarks,
            entry.HeartId,
            entry.HeartRemarks,
            entry.AbdomenId,
            entry.AbdomenRemarks,
            entry.NeuroId,
            entry.NeuroRemarks,
            entry.RectalId,
            entry.RectalRemarks,
            entry.GuId,
            entry.GuRemarks,
            entry.CreatedAt,
            entry.UpdatedAt);
    }
}
