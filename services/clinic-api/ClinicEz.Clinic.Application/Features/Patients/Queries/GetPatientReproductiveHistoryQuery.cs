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

public sealed record GetPatientReproductiveHistoryQuery(Guid PatientId) : IRequest<PatientReproductiveHistoryDto?>;

public sealed class GetPatientReproductiveHistoryQueryHandler : IRequestHandler<GetPatientReproductiveHistoryQuery, PatientReproductiveHistoryDto?>
{
    private readonly IRepository<PatientReproductiveHistory> _reproductiveRepo;
    private readonly ILegacyPatientProfileIngestionService _legacyIngestion;

    public GetPatientReproductiveHistoryQueryHandler(
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        ILegacyPatientProfileIngestionService legacyIngestion)
    {
        _reproductiveRepo = reproductiveRepo;
        _legacyIngestion = legacyIngestion;
    }

    public async Task<PatientReproductiveHistoryDto?> Handle(GetPatientReproductiveHistoryQuery request, CancellationToken cancellationToken)
    {
        await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);

        var entry = await _reproductiveRepo.Query(r => r.PatientId == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            return null;
        }

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
