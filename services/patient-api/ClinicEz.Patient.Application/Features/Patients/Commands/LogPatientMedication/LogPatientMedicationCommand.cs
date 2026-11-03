using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.LogPatientMedication;

public sealed record LogPatientMedicationCommand(
    Guid PatientId,
    Guid MedicationId,
    DateTime? TakenAt,
    string? Notes) : IRequest<PatientMedicationDto>;

public sealed class LogPatientMedicationCommandHandler : IRequestHandler<LogPatientMedicationCommand, PatientMedicationDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public LogPatientMedicationCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<PatientMedicationDto> Handle(LogPatientMedicationCommand command, CancellationToken cancellationToken)
    {
        var med = await _patientRepository.GetMedicationByIdAsync(command.PatientId, command.MedicationId, cancellationToken)
            ?? throw new NotFoundException($"Medication '{command.MedicationId}' not found for patient '{command.PatientId}'.");

        var now = DateTime.UtcNow;
        med.UpdatedAt = now;
        med.UpdatedBy = "PatientApp";
        if (!string.IsNullOrWhiteSpace(command.Notes))
        {
            med.Notes = string.IsNullOrWhiteSpace(med.Notes) ? command.Notes : $"{med.Notes}; {command.Notes}";
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientMedicationDto(
            med.Id,
            med.ClientId,
            med.MedicationName,
            med.GenericName,
            med.Dosage,
            med.Frequency,
            med.Route,
            med.StartDate,
            med.EndDate,
            med.IsCurrentlyTaking,
            med.PrescribedBy,
            med.Purpose,
            med.Notes,
            med.UpdatedAt
        );
    }
}
