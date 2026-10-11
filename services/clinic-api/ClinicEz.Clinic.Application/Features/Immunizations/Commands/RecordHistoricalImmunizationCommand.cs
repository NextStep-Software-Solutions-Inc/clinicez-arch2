using System;
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

public sealed record RecordHistoricalImmunizationCommand(
    Guid PatientId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    DateOnly AdministeredDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string? LotBatchNumber,
    string? HistoricalFacilityName,
    string? Route,
    string? InjectionSite,
    string? Remarks
) : IRequest<PatientImmunizationDto>;

public sealed class RecordHistoricalImmunizationValidator : AbstractValidator<RecordHistoricalImmunizationCommand>
{
    public RecordHistoricalImmunizationValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PhilHealthLibrary).NotEmpty();
        RuleFor(x => x.PhilHealthCode).NotEmpty();
        RuleFor(x => x.VaccineName).NotEmpty();
        RuleFor(x => x.DoseSequence).GreaterThanOrEqualTo(1);

        RuleFor(x => x.AdministeredDate).Must(d =>
        {
            var todayUtc = DateTime.UtcNow;
            var todayManila = DateOnly.FromDateTime(todayUtc.AddHours(8));
            return d <= todayManila;
        }).WithMessage("Historical immunization date cannot be in the future.");
    }
}

public sealed class RecordHistoricalImmunizationCommandHandler : IRequestHandler<RecordHistoricalImmunizationCommand, PatientImmunizationDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RecordHistoricalImmunizationCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientImmunization> immunizationRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _immunizationRepo = immunizationRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientImmunizationDto> Handle(RecordHistoricalImmunizationCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");

        var administeredDateTime = request.AdministeredDate.ToDateTime(new TimeOnly(12, 0), DateTimeKind.Utc);

        var immunization = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            BranchId = null,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            PhilHealthLibrary = request.PhilHealthLibrary,
            PhilHealthCode = request.PhilHealthCode,
            VaccineName = request.VaccineName,
            LotBatchNumber = !string.IsNullOrWhiteSpace(request.LotBatchNumber) ? request.LotBatchNumber : "HISTORICAL",
            ExpirationDate = request.AdministeredDate,
            DoseSequence = request.DoseSequence,
            IsSeriesCompleted = request.IsSeriesCompleted,
            Route = !string.IsNullOrWhiteSpace(request.Route) ? request.Route : "Not Specified",
            InjectionSite = !string.IsNullOrWhiteSpace(request.InjectionSite) ? request.InjectionSite : "Not Specified",
            AdministeredAtUtc = administeredDateTime,
            AdministeredByStaffId = Guid.Empty,
            AdministeredByStaffName = !string.IsNullOrWhiteSpace(request.HistoricalFacilityName) ? request.HistoricalFacilityName : "Historical Provider",
            IsHistorical = true,
            HistoricalFacilityName = request.HistoricalFacilityName,
            Remarks = request.Remarks,
            HasAdverseReaction = false,
            AdverseReactionSeverity = "None"
        };

        await _immunizationRepo.AddAsync(immunization, cancellationToken);
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
