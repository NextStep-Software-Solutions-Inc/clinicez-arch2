using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record UpdatePatientReproductiveHistoryCommand(
    Guid PatientId,
    bool IsApplicable = true,
    int? MenarcheAge = null,
    DateOnly? LastMenstrualPeriod = null,
    int? PeriodDurationDays = null,
    int? CycleIntervalDays = null,
    int? PadsPerDay = null,
    bool IsMenopausal = false,
    int? MenopauseAge = null,
    string? ContraceptiveMethod = null,
    int Gravidity = 0,
    int Parity = 0,
    int TermBirths = 0,
    int PretermBirths = 0,
    int Abortions = 0,
    int LivingChildren = 0,
    string? DeliveryType = null,
    bool HadPreEclampsiaHypertension = false,
    bool ReceivedFamilyPlanningCounseling = false,
    string? Remarks = null) : IRequest<PatientReproductiveHistoryDto>;

public sealed class UpdatePatientReproductiveHistoryCommandValidator : AbstractValidator<UpdatePatientReproductiveHistoryCommand>
{
    public UpdatePatientReproductiveHistoryCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class UpdatePatientReproductiveHistoryCommandHandler : IRequestHandler<UpdatePatientReproductiveHistoryCommand, PatientReproductiveHistoryDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientReproductiveHistory> _reproductiveRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientReproductiveHistoryCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _reproductiveRepo = reproductiveRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientReproductiveHistoryDto> Handle(UpdatePatientReproductiveHistoryCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        // Sex check: male patients are not applicable
        var isMale = patient.Sex == BiologicalSex.Male;
        var effectiveApplicable = !isMale && request.IsApplicable;

        var entry = await _reproductiveRepo.Query(r => r.PatientId == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            entry = new PatientReproductiveHistory
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                IsApplicable = effectiveApplicable,
                MenarcheAge = effectiveApplicable ? request.MenarcheAge : null,
                LastMenstrualPeriod = effectiveApplicable ? request.LastMenstrualPeriod : null,
                PeriodDurationDays = effectiveApplicable ? request.PeriodDurationDays : null,
                CycleIntervalDays = effectiveApplicable ? request.CycleIntervalDays : null,
                PadsPerDay = effectiveApplicable ? request.PadsPerDay : null,
                IsMenopausal = effectiveApplicable && request.IsMenopausal,
                MenopauseAge = effectiveApplicable ? request.MenopauseAge : null,
                ContraceptiveMethod = effectiveApplicable ? request.ContraceptiveMethod?.Trim() : null,
                Gravidity = effectiveApplicable ? request.Gravidity : 0,
                Parity = effectiveApplicable ? request.Parity : 0,
                TermBirths = effectiveApplicable ? request.TermBirths : 0,
                PretermBirths = effectiveApplicable ? request.PretermBirths : 0,
                Abortions = effectiveApplicable ? request.Abortions : 0,
                LivingChildren = effectiveApplicable ? request.LivingChildren : 0,
                DeliveryType = effectiveApplicable ? request.DeliveryType?.Trim() : "NotApplicable",
                HadPreEclampsiaHypertension = effectiveApplicable && request.HadPreEclampsiaHypertension,
                ReceivedFamilyPlanningCounseling = effectiveApplicable && request.ReceivedFamilyPlanningCounseling,
                Remarks = request.Remarks?.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician"
            };
            await _reproductiveRepo.AddAsync(entry, cancellationToken);
        }
        else
        {
            entry.IsApplicable = effectiveApplicable;
            entry.MenarcheAge = effectiveApplicable ? request.MenarcheAge : null;
            entry.LastMenstrualPeriod = effectiveApplicable ? request.LastMenstrualPeriod : null;
            entry.PeriodDurationDays = effectiveApplicable ? request.PeriodDurationDays : null;
            entry.CycleIntervalDays = effectiveApplicable ? request.CycleIntervalDays : null;
            entry.PadsPerDay = effectiveApplicable ? request.PadsPerDay : null;
            entry.IsMenopausal = effectiveApplicable && request.IsMenopausal;
            entry.MenopauseAge = effectiveApplicable ? request.MenopauseAge : null;
            entry.ContraceptiveMethod = effectiveApplicable ? request.ContraceptiveMethod?.Trim() : null;
            entry.Gravidity = effectiveApplicable ? request.Gravidity : 0;
            entry.Parity = effectiveApplicable ? request.Parity : 0;
            entry.TermBirths = effectiveApplicable ? request.TermBirths : 0;
            entry.PretermBirths = effectiveApplicable ? request.PretermBirths : 0;
            entry.Abortions = effectiveApplicable ? request.Abortions : 0;
            entry.LivingChildren = effectiveApplicable ? request.LivingChildren : 0;
            entry.DeliveryType = effectiveApplicable ? request.DeliveryType?.Trim() : "NotApplicable";
            entry.HadPreEclampsiaHypertension = effectiveApplicable && request.HadPreEclampsiaHypertension;
            entry.ReceivedFamilyPlanningCounseling = effectiveApplicable && request.ReceivedFamilyPlanningCounseling;
            entry.Remarks = request.Remarks?.Trim();
            entry.UpdatedAt = DateTime.UtcNow;
            entry.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician";

            _reproductiveRepo.Update(entry);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientReproductiveHistoryDto(
            entry.Id,
            entry.PatientId,
            entry.IsApplicable,
            entry.MenarcheAge,
            entry.LastMenstrualPeriod,
            entry.PeriodDurationDays,
            entry.CycleIntervalDays,
            entry.PadsPerDay,
            entry.IsMenopausal,
            entry.MenopauseAge,
            entry.ContraceptiveMethod,
            entry.Gravidity,
            entry.Parity,
            entry.TermBirths,
            entry.PretermBirths,
            entry.Abortions,
            entry.LivingChildren,
            entry.DeliveryType,
            entry.HadPreEclampsiaHypertension,
            entry.ReceivedFamilyPlanningCounseling,
            entry.Remarks);
    }
}
