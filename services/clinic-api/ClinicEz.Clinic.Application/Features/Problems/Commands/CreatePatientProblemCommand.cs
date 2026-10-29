using System;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Problems.Commands;

public record CreatePatientProblemCommand(
    Guid PatientId,
    Guid? ConsultationEncounterId,
    string Icd10Code,
    string ProblemTitle,
    string? PhilHealthMdiseaseCode = null,
    string Status = "Active",
    string Severity = "Moderate",
    bool IsChronicNcd = false,
    DateOnly? OnsetDate = null,
    string? ClinicalNotes = null,
    string? RecordedByDoctorName = null
) : IRequest<PatientProblemDto>;

public class CreatePatientProblemValidator : AbstractValidator<CreatePatientProblemCommand>
{
    private static readonly Regex Icd10Regex = new(@"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$", RegexOptions.Compiled);

    public CreatePatientProblemValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty().WithMessage("Patient ID is required.");
        RuleFor(x => x.Icd10Code)
            .NotEmpty().WithMessage("ICD-10 code is required.")
            .Must(code => !string.IsNullOrWhiteSpace(code) && Icd10Regex.IsMatch(code.Trim()))
            .WithMessage("ICD-10 code must adhere to standard format (e.g. I10, E11.9, J45.909).");
        RuleFor(x => x.ProblemTitle).NotEmpty().MaximumLength(255).WithMessage("Problem title is required.");
    }
}

public class CreatePatientProblemCommandHandler : IRequestHandler<CreatePatientProblemCommand, PatientProblemDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientMedicalHistory> _problemRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreatePatientProblemCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientMedicalHistory> problemRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _problemRepo = problemRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientProblemDto> Handle(CreatePatientProblemCommand command, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == command.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with ID {command.PatientId} not found.");
        }

        var status = Enum.TryParse<ProblemStatus>(command.Status, true, out var parsedStatus)
            ? parsedStatus
            : ProblemStatus.Active;

        var severity = Enum.TryParse<ProblemSeverity>(command.Severity, true, out var parsedSeverity)
            ? parsedSeverity
            : ProblemSeverity.Moderate;

        var doctorId = _clinicContext.StaffId ?? Guid.Empty;
        var doctorName = !string.IsNullOrWhiteSpace(command.RecordedByDoctorName)
            ? command.RecordedByDoctorName.Trim()
            : "Attending Physician";

        var problem = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = command.PatientId,
            Category = MedicalHistoryCategory.ProblemListItem,
            ConsultationEncounterId = command.ConsultationEncounterId,
            Icd10Code = command.Icd10Code.Trim().ToUpperInvariant(),
            ConditionTitle = command.ProblemTitle.Trim(),
            PhilHealthMdiseaseCode = command.PhilHealthMdiseaseCode?.Trim(),
            Status = status,
            Severity = severity,
            IsChronicNcd = command.IsChronicNcd,
            OnsetDate = command.OnsetDate,
            ClinicalNotes = command.ClinicalNotes?.Trim(),
            RecordedByStaffId = doctorId,
            RecordedByStaffName = doctorName
        };

        await _problemRepo.AddAsync(problem, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientProblemDto(
            problem.Id,
            problem.ClinicId,
            problem.PatientId,
            problem.ConsultationEncounterId,
            problem.Icd10Code,
            problem.ConditionTitle,
            problem.PhilHealthMdiseaseCode,
            problem.Status.ToString(),
            problem.Severity?.ToString() ?? "Moderate",
            problem.IsChronicNcd,
            problem.OnsetDate,
            problem.ResolvedDate,
            problem.ClinicalNotes,
            problem.RecordedByStaffId ?? Guid.Empty,
            problem.RecordedByStaffName,
            problem.CreatedAt
        );
    }
}
