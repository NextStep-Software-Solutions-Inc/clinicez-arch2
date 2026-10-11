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

public sealed record UpdatePatientSocialHistoryCommand(
    Guid PatientId,
    bool IsSmoker,
    decimal? PacksPerDay = null,
    int? CigarettesPerDay = null,
    int? YearsSmoking = null,
    decimal? SmokingPackYears = null,
    DateOnly? SmokingStoppedDate = null,
    bool IsAlcoholDrinker = false,
    int? AlcoholDrinksPerWeek = null,
    int? AlcoholBottlesPerDay = null,
    string? AlcoholFrequency = null,
    bool UsesIllicitDrugs = false,
    string? SubstanceUseHistory = null,
    string? DrugTypes = null,
    bool IsSexuallyActive = false,
    int? CoitarcheAge = null,
    string? PhysicalActivityFrequency = null,
    string? DietaryHabits = null,
    string? Remarks = null) : IRequest<PatientSocialHistoryDto>;

public sealed class UpdatePatientSocialHistoryCommandValidator : AbstractValidator<UpdatePatientSocialHistoryCommand>
{
    public UpdatePatientSocialHistoryCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class UpdatePatientSocialHistoryCommandHandler : IRequestHandler<UpdatePatientSocialHistoryCommand, PatientSocialHistoryDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientSocialHistory> _socialRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientSocialHistoryCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientSocialHistory> socialRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _socialRepo = socialRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientSocialHistoryDto> Handle(UpdatePatientSocialHistoryCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        var entry = await _socialRepo.Query(s => s.PatientId == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        // Auto-calculate pack-years if packs and years are given
        decimal? calculatedPackYears = request.SmokingPackYears;
        if (!calculatedPackYears.HasValue && request.PacksPerDay.HasValue && request.YearsSmoking.HasValue)
        {
            calculatedPackYears = Math.Round(request.PacksPerDay.Value * request.YearsSmoking.Value, 2);
        }
        else if (!calculatedPackYears.HasValue && request.CigarettesPerDay.HasValue && request.YearsSmoking.HasValue)
        {
            calculatedPackYears = Math.Round((decimal)request.CigarettesPerDay.Value / 20m * request.YearsSmoking.Value, 2);
        }

        if (entry == null)
        {
            entry = new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                IsSmoker = request.IsSmoker,
                PacksPerDay = request.PacksPerDay,
                CigarettesPerDay = request.CigarettesPerDay,
                YearsSmoking = request.YearsSmoking,
                SmokingPackYears = calculatedPackYears,
                SmokingStoppedDate = request.SmokingStoppedDate,
                IsAlcoholDrinker = request.IsAlcoholDrinker,
                AlcoholDrinksPerWeek = request.AlcoholDrinksPerWeek,
                AlcoholBottlesPerDay = request.AlcoholBottlesPerDay,
                AlcoholFrequency = request.AlcoholFrequency?.Trim(),
                UsesIllicitDrugs = request.UsesIllicitDrugs,
                SubstanceUseHistory = request.SubstanceUseHistory?.Trim(),
                DrugTypes = request.DrugTypes?.Trim(),
                IsSexuallyActive = request.IsSexuallyActive,
                CoitarcheAge = request.CoitarcheAge,
                PhysicalActivityFrequency = request.PhysicalActivityFrequency?.Trim(),
                DietaryHabits = request.DietaryHabits?.Trim(),
                Remarks = request.Remarks?.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician"
            };
            await _socialRepo.AddAsync(entry, cancellationToken);
        }
        else
        {
            entry.IsSmoker = request.IsSmoker;
            entry.PacksPerDay = request.PacksPerDay;
            entry.CigarettesPerDay = request.CigarettesPerDay;
            entry.YearsSmoking = request.YearsSmoking;
            entry.SmokingPackYears = calculatedPackYears;
            entry.SmokingStoppedDate = request.SmokingStoppedDate;
            entry.IsAlcoholDrinker = request.IsAlcoholDrinker;
            entry.AlcoholDrinksPerWeek = request.AlcoholDrinksPerWeek;
            entry.AlcoholBottlesPerDay = request.AlcoholBottlesPerDay;
            entry.AlcoholFrequency = request.AlcoholFrequency?.Trim();
            entry.UsesIllicitDrugs = request.UsesIllicitDrugs;
            entry.SubstanceUseHistory = request.SubstanceUseHistory?.Trim();
            entry.DrugTypes = request.DrugTypes?.Trim();
            entry.IsSexuallyActive = request.IsSexuallyActive;
            entry.CoitarcheAge = request.CoitarcheAge;
            entry.PhysicalActivityFrequency = request.PhysicalActivityFrequency?.Trim();
            entry.DietaryHabits = request.DietaryHabits?.Trim();
            entry.Remarks = request.Remarks?.Trim();
            entry.UpdatedAt = DateTime.UtcNow;
            entry.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician";

            _socialRepo.Update(entry);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientSocialHistoryDto(
            entry.Id,
            entry.PatientId,
            entry.IsSmoker,
            entry.PacksPerDay,
            entry.CigarettesPerDay,
            entry.YearsSmoking,
            entry.SmokingPackYears,
            entry.SmokingStoppedDate,
            entry.IsAlcoholDrinker,
            entry.AlcoholDrinksPerWeek,
            entry.AlcoholBottlesPerDay,
            entry.AlcoholFrequency,
            entry.UsesIllicitDrugs,
            entry.SubstanceUseHistory,
            entry.DrugTypes,
            entry.IsSexuallyActive,
            entry.CoitarcheAge,
            entry.PhysicalActivityFrequency,
            entry.DietaryHabits,
            entry.Remarks);
    }
}
