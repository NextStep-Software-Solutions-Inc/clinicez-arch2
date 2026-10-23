using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Immunizations.Commands;

public sealed record AdministerVaccineCommand(
    Guid PatientId,
    Guid? ConsultationEncounterId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    string? BrandName,
    string? Manufacturer,
    string LotBatchNumber,
    DateOnly ExpirationDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string Route,
    string InjectionSite,
    DateTime AdministeredAtUtc,
    Guid AdministeredByStaffId,
    string AdministeredByStaffName,
    string? AdministeredByPrcLicense,
    string? Remarks,
    Guid? QueueItemId = null,
    bool CompleteVisit = false
) : IRequest<PatientImmunizationDto>;

public sealed class AdministerVaccineValidator : AbstractValidator<AdministerVaccineCommand>
{
    public AdministerVaccineValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PhilHealthLibrary).NotEmpty();
        RuleFor(x => x.PhilHealthCode).NotEmpty();
        RuleFor(x => x.VaccineName).NotEmpty();
        RuleFor(x => x.LotBatchNumber).NotEmpty();
        RuleFor(x => x.Route).NotEmpty();
        RuleFor(x => x.InjectionSite).NotEmpty();
        RuleFor(x => x.DoseSequence).GreaterThanOrEqualTo(1);
        RuleFor(x => x.AdministeredByStaffName).NotEmpty();

        // Safety gate against vaccine expiration using Asia/Manila (UTC+8) clinic local time
        RuleFor(x => x.ExpirationDate).Must(exp =>
        {
            var todayUtc = DateTime.UtcNow;
            var todayManila = DateOnly.FromDateTime(todayUtc.AddHours(8));
            return exp >= todayManila;
        }).WithMessage("Cannot administer expired vaccine batch.");
    }
}

public sealed class AdministerVaccineCommandHandler : IRequestHandler<AdministerVaccineCommand, PatientImmunizationDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IImmunizationEventPublisher _publisher;
    private readonly IRepository<QueueItem>? _queueRepo;

    public AdministerVaccineCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientImmunization> immunizationRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IImmunizationEventPublisher publisher,
        IRepository<QueueItem>? queueRepo = null)
    {
        _patientRepo = patientRepo;
        _immunizationRepo = immunizationRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _queueRepo = queueRepo;
    }

    public async Task<PatientImmunizationDto> Handle(AdministerVaccineCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");

        var immunization = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            BranchId = null,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            ConsultationEncounterId = request.ConsultationEncounterId,
            PhilHealthLibrary = request.PhilHealthLibrary,
            PhilHealthCode = request.PhilHealthCode,
            VaccineName = request.VaccineName,
            BrandName = request.BrandName,
            Manufacturer = request.Manufacturer,
            LotBatchNumber = request.LotBatchNumber,
            ExpirationDate = request.ExpirationDate,
            DoseSequence = request.DoseSequence,
            IsSeriesCompleted = request.IsSeriesCompleted,
            Route = request.Route,
            InjectionSite = request.InjectionSite,
            AdministeredAtUtc = request.AdministeredAtUtc == default ? DateTime.UtcNow : request.AdministeredAtUtc,
            AdministeredByStaffId = request.AdministeredByStaffId,
            AdministeredByStaffName = request.AdministeredByStaffName,
            AdministeredByPrcLicense = request.AdministeredByPrcLicense,
            IsHistorical = false,
            Remarks = request.Remarks,
            HasAdverseReaction = false,
            AdverseReactionSeverity = "None"
        };

        await _immunizationRepo.AddAsync(immunization, cancellationToken);

        // Publish interop event to outbox BEFORE SaveChanges commits (atomic outbox pattern)
        if (patient.SyncPatientId.HasValue && patient.SyncPatientId.Value != Guid.Empty)
        {
            await _publisher.PublishImmunizationAdministeredAsync(immunization, cancellationToken);
            immunization.IsSynchronizedToPatientApp = true;
            immunization.SynchronizedAtUtc = DateTime.UtcNow;
        }

        if (request.QueueItemId.HasValue && request.CompleteVisit && _queueRepo != null)
        {
            var queueItem = await _queueRepo.Query(q => q.Id == request.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (queueItem != null && queueItem.Status != QueueStatus.Completed && queueItem.Status != QueueStatus.Cancelled)
            {
                queueItem.Status = QueueStatus.DischargedNonDoctor;
                queueItem.CompletedTime = DateTime.UtcNow;
                queueItem.DischargedAt = DateTime.UtcNow;
                queueItem.DischargedByStaffId = request.AdministeredByStaffId;
                queueItem.DischargeNotes = !string.IsNullOrWhiteSpace(request.Remarks)
                    ? request.Remarks.Trim()
                    : $"Discharged following vaccine administration: {request.VaccineName}";
                queueItem.UpdatedAt = DateTime.UtcNow;
                _queueRepo.Update(queueItem);
            }
        }

        TrySyncToPhilHealthProfile(patient, request.PhilHealthLibrary, request.PhilHealthCode);
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

    private static void TrySyncToPhilHealthProfile(ClinicPatient patient, string philHealthLibrary, string philHealthCode)
    {
        if (patient.CustomFields == null || !patient.CustomFields.TryGetValue("philhealth_profile", out var profObj) || profObj == null)
            return;

        PhilHealthPatientProfileDto? prof = null;
        if (profObj is PhilHealthPatientProfileDto typed)
        {
            prof = typed;
        }
        else
        {
            try
            {
                var json = profObj.ToString();
                if (!string.IsNullOrWhiteSpace(json))
                {
                    prof = JsonSerializer.Deserialize<PhilHealthPatientProfileDto>(json,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
            }
            catch
            {
                return;
            }
        }

        if (prof == null) return;

        var lib = philHealthLibrary.ToLowerInvariant();
        var code = philHealthCode.Trim();
        if (string.IsNullOrWhiteSpace(code) || code.Equals("999", StringComparison.OrdinalIgnoreCase)) return;

        if (lib.Contains("child"))
        {
            if (!prof.ChildImmunizations.Contains(code, StringComparer.OrdinalIgnoreCase))
                prof = prof with { ChildImmunizations = [..prof.ChildImmunizations, code] };
        }
        else if (lib.Contains("young"))
        {
            if (!prof.YoungWomanImmunizations.Contains(code, StringComparer.OrdinalIgnoreCase))
                prof = prof with { YoungWomanImmunizations = [..prof.YoungWomanImmunizations, code] };
        }
        else if (lib.Contains("preg"))
        {
            if (!prof.PregnantWomanImmunizations.Contains(code, StringComparer.OrdinalIgnoreCase))
                prof = prof with { PregnantWomanImmunizations = [..prof.PregnantWomanImmunizations, code] };
        }
        else if (lib.Contains("elderly"))
        {
            if (!prof.ElderlyImmunizations.Contains(code, StringComparer.OrdinalIgnoreCase))
                prof = prof with { ElderlyImmunizations = [..prof.ElderlyImmunizations, code] };
        }
        else
        {
            if (!prof.OtherImmunizations.Contains(code, StringComparer.OrdinalIgnoreCase))
                prof = prof with { OtherImmunizations = [..prof.OtherImmunizations, code] };
        }

        patient.CustomFields["philhealth_profile"] = prof;
    }
}
