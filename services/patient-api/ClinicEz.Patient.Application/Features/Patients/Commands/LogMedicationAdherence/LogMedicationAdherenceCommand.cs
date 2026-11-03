using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.LogMedicationAdherence;

public sealed record LogMedicationAdherenceCommand(
    Guid PatientId,
    Guid MedicationId,
    DateTime? TakenAt = null,
    string? Notes = null) : IRequest<bool>;

public sealed class LogMedicationAdherenceCommandHandler : IRequestHandler<LogMedicationAdherenceCommand, bool>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public LogMedicationAdherenceCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(LogMedicationAdherenceCommand command, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(command.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{command.PatientId}' was not found.");

        var med = await _patientRepository.GetMedicationByIdAsync(command.PatientId, command.MedicationId, cancellationToken)
            ?? throw new NotFoundException($"Medication '{command.MedicationId}' not found for patient '{command.PatientId}'.");

        var takenAt = command.TakenAt ?? DateTime.UtcNow;
        var date = DateOnly.FromDateTime(takenAt);

        var existingAdherences = await _patientRepository.GetMedicationAdherenceForDateAsync(command.PatientId, date, cancellationToken);
        var existing = existingAdherences.FirstOrDefault(a => a.PatientMedicationId == command.MedicationId);

        if (existing != null)
        {
            existing.IsTaken = true;
            existing.TakenAt = takenAt;
            if (!string.IsNullOrWhiteSpace(command.Notes))
            {
                existing.Notes = command.Notes;
            }
            existing.UpdatedAt = DateTime.UtcNow;
            existing.UpdatedBy = "PatientApp";
        }
        else
        {
            var adherence = new PatientMedicationAdherence
            {
                Id = Guid.NewGuid(),
                PatientId = command.PatientId,
                PatientMedicationId = command.MedicationId,
                TakenAt = takenAt,
                IsTaken = true,
                Notes = command.Notes,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "PatientApp"
            };

            await _patientRepository.AddMedicationAdherenceAsync(adherence, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
