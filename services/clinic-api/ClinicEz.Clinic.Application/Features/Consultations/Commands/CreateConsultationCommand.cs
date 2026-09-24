using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record DiagnosisInput(string Icd10Code, string Description, bool IsPrimary = false);

public sealed record PrescriptionInput(
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays = null,
    int Refills = 0,
    bool IsDangerousDrug = false,
    string? Remarks = null);

public sealed record CreateConsultationCommand(
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    Guid? QueueItemId = null,
    Guid? AppointmentId = null,
    string? Subjective = null,
    string? Objective = null,
    string? Assessment = null,
    string? Plan = null,
    List<DiagnosisInput>? Diagnoses = null,
    List<PrescriptionInput>? Prescriptions = null) : IRequest<ConsultationEncounterDto>;

public sealed class CreateConsultationCommandValidator : AbstractValidator<CreateConsultationCommand>
{
    public CreateConsultationCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(150);
    }
}

public sealed class CreateConsultationCommandHandler : IRequestHandler<CreateConsultationCommand, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ConsultationEncounterDto> Handle(CreateConsultationCommand request, CancellationToken cancellationToken)
    {
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            QueueItemId = request.QueueItemId,
            AppointmentId = request.AppointmentId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName.Trim(),
            EncounterDate = DateTime.UtcNow,
            Subjective = request.Subjective ?? string.Empty,
            Objective = request.Objective ?? string.Empty,
            Assessment = request.Assessment ?? string.Empty,
            Plan = request.Plan ?? string.Empty,
            IsSigned = false,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.DoctorName
        };

        if (request.Diagnoses != null)
        {
            foreach (var diag in request.Diagnoses)
            {
                encounter.Diagnoses.Add(new EncounterDiagnosis
                {
                    Id = Guid.NewGuid(),
                    ConsultationEncounterId = encounter.Id,
                    Icd10Code = diag.Icd10Code.Trim().ToUpperInvariant(),
                    Description = diag.Description.Trim(),
                    IsPrimary = diag.IsPrimary,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = request.DoctorName
                });
            }
        }

        if (request.Prescriptions != null)
        {
            foreach (var rx in request.Prescriptions)
            {
                encounter.Prescriptions.Add(new PrescriptionItem
                {
                    Id = Guid.NewGuid(),
                    ConsultationEncounterId = encounter.Id,
                    GenericName = rx.GenericName.Trim(),
                    BrandName = rx.BrandName?.Trim(),
                    Dosage = rx.Dosage.Trim(),
                    Form = rx.Form.Trim(),
                    Sig = rx.Sig.Trim(),
                    Quantity = rx.Quantity,
                    DurationDays = rx.DurationDays,
                    Refills = rx.Refills,
                    IsDangerousDrug = rx.IsDangerousDrug,
                    Remarks = rx.Remarks?.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = request.DoctorName
                });
            }
        }

        await _consultationRepository.AddAsync(encounter, cancellationToken);

        // Update queue item state if linked
        if (request.QueueItemId.HasValue)
        {
            var queueItem = await _queueRepository.Query(q => 
                q.Id == request.QueueItemId.Value && 
                q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null && queueItem.Status != QueueStatus.Completed)
            {
                queueItem.Status = QueueStatus.InConsultation;
                queueItem.CalledTime ??= DateTime.UtcNow;
                queueItem.DoctorId = request.DoctorId;
                queueItem.DoctorName = request.DoctorName;
                queueItem.UpdatedAt = DateTime.UtcNow;
                _queueRepository.Update(queueItem);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new ConsultationEncounterDto(
            encounter.Id,
            encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks)).ToList());
    }
}
