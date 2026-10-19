using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Immunizations.Commands;

public sealed record RecordImmunizationAefiCommand(
    Guid PatientId,
    Guid ImmunizationId,
    string AdverseReactionSeverity, // "Mild", "Moderate", "Severe", "Anaphylaxis"
    string AdverseReactionRemarks,
    DateTime RecordedAtUtc
) : IRequest<PatientImmunizationDto>;

public sealed class RecordImmunizationAefiValidator : AbstractValidator<RecordImmunizationAefiCommand>
{
    private static readonly string[] AllowedSeverities = ["Mild", "Moderate", "Severe", "Anaphylaxis"];

    public RecordImmunizationAefiValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.ImmunizationId).NotEmpty();
        RuleFor(x => x.AdverseReactionRemarks).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.AdverseReactionSeverity)
            .Must(s => AllowedSeverities.Contains(s, StringComparer.OrdinalIgnoreCase))
            .WithMessage("Adverse reaction severity must be Mild, Moderate, Severe, or Anaphylaxis.");
    }
}

public sealed class RecordImmunizationAefiCommandHandler : IRequestHandler<RecordImmunizationAefiCommand, PatientImmunizationDto>
{
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RecordImmunizationAefiCommandHandler(
        IRepository<PatientImmunization> immunizationRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _immunizationRepo = immunizationRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientImmunizationDto> Handle(RecordImmunizationAefiCommand request, CancellationToken cancellationToken)
    {
        var immunization = await _immunizationRepo.Query(i => i.Id == request.ImmunizationId && i.PatientId == request.PatientId && i.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (immunization == null)
            throw new NotFoundException($"Immunization with ID '{request.ImmunizationId}' not found for patient '{request.PatientId}'.");

        immunization.HasAdverseReaction = true;
        immunization.AdverseReactionSeverity = request.AdverseReactionSeverity;
        immunization.AdverseReactionRemarks = request.AdverseReactionRemarks;
        immunization.AdverseReactionRecordedAtUtc = request.RecordedAtUtc == default ? DateTime.UtcNow : request.RecordedAtUtc;

        _immunizationRepo.Update(immunization);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientImmunizationDto(
            immunization.Id,
            immunization.PatientId,
            immunization.PatientName,
            immunization.ConsultationEncounterId,
            immunization.PhilHealthLibrary,
            immunization.PhilHealthCode,
            immunization.VaccineName,
            immunization.BrandName,
            immunization.Manufacturer,
            immunization.LotBatchNumber,
            immunization.ExpirationDate,
            immunization.DoseSequence,
            immunization.IsSeriesCompleted,
            immunization.Route,
            immunization.InjectionSite,
            immunization.AdministeredAtUtc,
            immunization.AdministeredByStaffId,
            immunization.AdministeredByStaffName,
            immunization.AdministeredByPrcLicense,
            immunization.HasAdverseReaction,
            immunization.AdverseReactionSeverity,
            immunization.AdverseReactionRemarks,
            immunization.AdverseReactionRecordedAtUtc,
            immunization.IsHistorical,
            immunization.HistoricalFacilityName,
            immunization.Remarks,
            immunization.IsSynchronizedToPatientApp,
            immunization.SynchronizedAtUtc
        );
    }
}
