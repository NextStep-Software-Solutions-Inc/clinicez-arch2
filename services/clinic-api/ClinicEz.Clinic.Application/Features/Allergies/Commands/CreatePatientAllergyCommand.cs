using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Allergies.Commands;

public record CreatePatientAllergyCommand(
    Guid PatientId,
    string Category = "Medication",
    string Allergen = "",
    string? AllergenDrugCode = null,
    string Severity = "Moderate",
    string? ReactionManifestation = null,
    bool IsAnaphylactic = false,
    DateOnly? OnsetDate = null,
    string? Notes = null
) : IRequest<PatientAllergyDto>;

public class CreatePatientAllergyValidator : AbstractValidator<CreatePatientAllergyCommand>
{
    public CreatePatientAllergyValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty().WithMessage("Patient ID is required.");
        RuleFor(x => x.Allergen).NotEmpty().MaximumLength(150).WithMessage("Allergen name is required.");
        RuleFor(x => x.Category).NotEmpty().Must(c => Enum.TryParse<AllergyCategory>(c, true, out _))
            .WithMessage("Category must be one of: Medication, Food, Environmental, Biologic, Other.");
    }
}

public class CreatePatientAllergyCommandHandler : IRequestHandler<CreatePatientAllergyCommand, PatientAllergyDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreatePatientAllergyCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientAllergy> allergyRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _allergyRepo = allergyRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientAllergyDto> Handle(CreatePatientAllergyCommand command, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == command.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with ID {command.PatientId} not found.");
        }

        var category = Enum.TryParse<AllergyCategory>(command.Category, true, out var parsedCategory)
            ? parsedCategory
            : AllergyCategory.Medication;

        var severity = Enum.TryParse<AllergySeverity>(command.Severity, true, out var parsedSeverity)
            ? parsedSeverity
            : (command.IsAnaphylactic ? AllergySeverity.LifeThreatening : AllergySeverity.Moderate);

        var allergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = command.PatientId,
            Category = category,
            Allergen = command.Allergen.Trim(),
            AllergenDrugCode = command.AllergenDrugCode?.Trim(),
            Severity = severity,
            ReactionManifestation = command.ReactionManifestation?.Trim(),
            IsAnaphylactic = command.IsAnaphylactic || severity == AllergySeverity.LifeThreatening,
            Status = AllergyStatus.Active,
            OnsetDate = command.OnsetDate,
            Notes = command.Notes?.Trim()
        };

        await _allergyRepo.AddAsync(allergy, cancellationToken);

        // Keep ClinicPatient.Allergies summary string updated in sync for backwards-compatibility
        var existingSummary = patient.Allergies;
        var allergenName = allergy.Allergen;
        if (string.IsNullOrWhiteSpace(existingSummary))
        {
            patient.Allergies = allergenName;
        }
        else if (!existingSummary.Contains(allergenName, StringComparison.OrdinalIgnoreCase))
        {
            patient.Allergies = $"{existingSummary}, {allergenName}";
        }
        _patientRepo.Update(patient);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientAllergyDto(
            allergy.Id,
            allergy.ClinicId,
            allergy.PatientId,
            allergy.Category.ToString(),
            allergy.Allergen,
            allergy.AllergenDrugCode,
            allergy.Severity.ToString(),
            allergy.ReactionManifestation,
            allergy.IsAnaphylactic,
            allergy.Status.ToString(),
            allergy.OnsetDate,
            allergy.Notes,
            allergy.CreatedAt
        );
    }
}
