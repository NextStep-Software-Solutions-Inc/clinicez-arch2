using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.RecordPatientVitals;

public sealed record RecordPatientVitalsCommand(
    Guid PatientId,
    RecordPatientVitalsRequest Request) : IRequest<VitalSignsDto>;

public sealed class RecordPatientVitalsCommandHandler : IRequestHandler<RecordPatientVitalsCommand, VitalSignsDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public RecordPatientVitalsCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<VitalSignsDto> Handle(RecordPatientVitalsCommand command, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(command.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{command.PatientId}' not found.");

        var req = command.Request;
        var now = DateTime.UtcNow;
        var vital = new VitalSigns
        {
            Id = Guid.NewGuid(),
            PatientId = command.PatientId,
            ClinicId = req.ClinicId ?? Guid.Empty,
            ConsultationId = req.ConsultationId,
            RecordedAt = req.RecordedAt ?? now,
            WeightKg = req.WeightKg,
            HeightCm = req.HeightCm,
            Bmi = req.Bmi,
            SystolicBp = req.SystolicBp,
            DiastolicBp = req.DiastolicBp,
            HeartRateBpm = req.HeartRateBpm,
            TemperatureCelsius = req.TemperatureCelsius,
            OxygenSaturationPercent = req.OxygenSaturationPercent,
            RespiratoryRateBreathsPerMin = req.RespiratoryRateBreathsPerMin,
            CreatedAt = now,
            CreatedBy = "PatientApp"
        };

        await _patientRepository.AddVitalSignsAsync(vital, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new VitalSignsDto(
            vital.Id,
            vital.PatientId,
            vital.ClinicId,
            vital.ConsultationId,
            vital.RecordedAt,
            vital.WeightKg,
            vital.HeightCm,
            vital.Bmi,
            vital.SystolicBp,
            vital.DiastolicBp,
            vital.HeartRateBpm,
            vital.TemperatureCelsius,
            vital.OxygenSaturationPercent,
            vital.RespiratoryRateBreathsPerMin,
            req.FastingBloodGlucose,
            req.TakenBy,
            req.Facility,
            vital.CreatedAt,
            vital.UpdatedAt
        );
    }
}
