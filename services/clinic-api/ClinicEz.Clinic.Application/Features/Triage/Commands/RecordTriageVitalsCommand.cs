using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Triage.Commands;

public sealed record RecordTriageVitalsCommand(
    Guid QueueItemId,
    Guid? NurseId,
    string? RecordedByNurseName,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    int? RespiratoryRateBreathsPerMin,
    decimal? OxygenSaturationPercent,
    decimal? HeightCm,
    decimal? WeightKg,
    int? PainScore,
    string? Notes) : IRequest<TriageVitalsDto>;

public sealed class RecordTriageVitalsCommandValidator : AbstractValidator<RecordTriageVitalsCommand>
{
    public RecordTriageVitalsCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        When(x => x.SystolicBp.HasValue, () => RuleFor(x => x.SystolicBp).InclusiveBetween(50, 300));
        When(x => x.DiastolicBp.HasValue, () => RuleFor(x => x.DiastolicBp).InclusiveBetween(30, 200));
        When(x => x.HeartRateBpm.HasValue, () => RuleFor(x => x.HeartRateBpm).InclusiveBetween(30, 250));
        When(x => x.TemperatureCelsius.HasValue, () => RuleFor(x => x.TemperatureCelsius).InclusiveBetween(30m, 45m));
        When(x => x.OxygenSaturationPercent.HasValue, () => RuleFor(x => x.OxygenSaturationPercent).InclusiveBetween(50m, 100m));
        When(x => x.PainScore.HasValue, () => RuleFor(x => x.PainScore).InclusiveBetween(0, 10));
    }
}

public sealed class RecordTriageVitalsCommandHandler : IRequestHandler<RecordTriageVitalsCommand, TriageVitalsDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<TriageVitals> _vitalsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RecordTriageVitalsCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<TriageVitals> vitalsRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _vitalsRepository = vitalsRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<TriageVitalsDto> Handle(RecordTriageVitalsCommand request, CancellationToken cancellationToken)
    {
        var queueItem = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (queueItem == null)
        {
            throw new NotFoundException($"Queue ticket '{request.QueueItemId}' not found in this clinic.");
        }

        // Automated BMI Calculation: weight (kg) / [height (m)]^2
        decimal? calculatedBmi = null;
        if (request.HeightCm is > 0 && request.WeightKg is > 0)
        {
            var heightInMeters = request.HeightCm.Value / 100m;
            calculatedBmi = Math.Round(request.WeightKg.Value / (heightInMeters * heightInMeters), 2);
        }

        var vitals = queueItem.TriageVitals;
        if (vitals == null)
        {
            vitals = new TriageVitals
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                QueueItemId = queueItem.Id,
                PatientId = queueItem.PatientId,
                NurseId = request.NurseId,
                RecordedByNurseName = request.RecordedByNurseName?.Trim(),
                RecordedAt = DateTime.UtcNow,
                SystolicBp = request.SystolicBp,
                DiastolicBp = request.DiastolicBp,
                HeartRateBpm = request.HeartRateBpm,
                TemperatureCelsius = request.TemperatureCelsius,
                RespiratoryRateBreathsPerMin = request.RespiratoryRateBreathsPerMin,
                OxygenSaturationPercent = request.OxygenSaturationPercent,
                HeightCm = request.HeightCm,
                WeightKg = request.WeightKg,
                Bmi = calculatedBmi,
                PainScore = request.PainScore,
                Notes = request.Notes?.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse"
            };

            await _vitalsRepository.AddAsync(vitals, cancellationToken);
        }
        else
        {
            vitals.NurseId = request.NurseId ?? vitals.NurseId;
            vitals.RecordedByNurseName = request.RecordedByNurseName?.Trim() ?? vitals.RecordedByNurseName;
            vitals.RecordedAt = DateTime.UtcNow;
            vitals.SystolicBp = request.SystolicBp;
            vitals.DiastolicBp = request.DiastolicBp;
            vitals.HeartRateBpm = request.HeartRateBpm;
            vitals.TemperatureCelsius = request.TemperatureCelsius;
            vitals.RespiratoryRateBreathsPerMin = request.RespiratoryRateBreathsPerMin;
            vitals.OxygenSaturationPercent = request.OxygenSaturationPercent;
            vitals.HeightCm = request.HeightCm;
            vitals.WeightKg = request.WeightKg;
            vitals.Bmi = calculatedBmi;
            vitals.PainScore = request.PainScore;
            vitals.Notes = request.Notes?.Trim();
            vitals.UpdatedAt = DateTime.UtcNow;
            vitals.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse";

            _vitalsRepository.Update(vitals);
        }

        // Transition queue status to Triaged if waiting
        if (queueItem.Status == QueueStatus.Waiting)
        {
            queueItem.Status = QueueStatus.Triaged;
            queueItem.UpdatedAt = DateTime.UtcNow;
            _queueRepository.Update(queueItem);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new TriageVitalsDto(
            vitals.Id,
            vitals.TenantId,
            vitals.ClinicId,
            vitals.QueueItemId,
            vitals.PatientId,
            vitals.NurseId,
            vitals.RecordedByNurseName,
            vitals.RecordedAt,
            vitals.SystolicBp,
            vitals.DiastolicBp,
            vitals.HeartRateBpm,
            vitals.TemperatureCelsius,
            vitals.RespiratoryRateBreathsPerMin,
            vitals.OxygenSaturationPercent,
            vitals.HeightCm,
            vitals.WeightKg,
            vitals.Bmi,
            vitals.PainScore,
            vitals.Notes);
    }
}
