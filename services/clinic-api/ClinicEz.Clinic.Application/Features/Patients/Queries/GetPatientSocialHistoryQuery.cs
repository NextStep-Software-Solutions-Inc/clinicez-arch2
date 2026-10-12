using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientSocialHistoryQuery(Guid PatientId) : IRequest<PatientSocialHistoryDto?>;

public sealed class GetPatientSocialHistoryQueryHandler : IRequestHandler<GetPatientSocialHistoryQuery, PatientSocialHistoryDto?>
{
    private readonly IRepository<PatientSocialHistory> _socialRepo;
    private readonly ILegacyPatientProfileIngestionService _legacyIngestion;

    public GetPatientSocialHistoryQueryHandler(
        IRepository<PatientSocialHistory> socialRepo,
        ILegacyPatientProfileIngestionService legacyIngestion)
    {
        _socialRepo = socialRepo;
        _legacyIngestion = legacyIngestion;
    }

    public async Task<PatientSocialHistoryDto?> Handle(GetPatientSocialHistoryQuery request, CancellationToken cancellationToken)
    {
        await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);

        var entry = await _socialRepo.Query(s => s.PatientId == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            return null;
        }

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
            entry.Remarks,
            entry.SmokingStatus,
            entry.AlcoholStatus);
    }
}

