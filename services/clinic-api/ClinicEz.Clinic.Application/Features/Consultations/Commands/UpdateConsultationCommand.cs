using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record UpdateConsultationCommand(
    Guid Id,
    string? Subjective,
    string? Objective,
    string? Assessment,
    string? Plan,
    List<DiagnosisInput>? Diagnoses,
    List<PrescriptionInput>? Prescriptions) : IRequest<ConsultationEncounterDto>;

public sealed class UpdateConsultationCommandValidator : AbstractValidator<UpdateConsultationCommand>
{
    public UpdateConsultationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class UpdateConsultationCommandHandler : IRequestHandler<UpdateConsultationCommand, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<EncounterDiagnosis> _diagnosisRepository;
    private readonly IRepository<PrescriptionItem> _prescriptionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<EncounterDiagnosis> diagnosisRepository,
        IRepository<PrescriptionItem> prescriptionRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _consultationRepository = consultationRepository;
        _diagnosisRepository = diagnosisRepository;
        _prescriptionRepository = prescriptionRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ConsultationEncounterDto> Handle(UpdateConsultationCommand request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository.Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Consultation encounter '{request.Id}' was not found in this clinic.");
        }

        if (encounter.IsSigned)
        {
            throw new BadRequestException("Encounter is already signed and locked. Amendments cannot overwrite a signed record.");
        }

        if (request.Subjective != null) encounter.Subjective = request.Subjective;
        if (request.Objective != null) encounter.Objective = request.Objective;
        if (request.Assessment != null) encounter.Assessment = request.Assessment;
        if (request.Plan != null) encounter.Plan = request.Plan;
        encounter.UpdatedAt = DateTime.UtcNow;
        encounter.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Doctor";

        if (request.Diagnoses != null)
        {
            // Remove previous diagnoses and replace with updated set
            foreach (var diag in encounter.Diagnoses.ToList())
            {
                _diagnosisRepository.Remove(diag);
            }
            encounter.Diagnoses.Clear();

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
                    CreatedBy = encounter.DoctorName
                });
            }
        }

        if (request.Prescriptions != null)
        {
            // Remove previous prescriptions and replace with updated set
            foreach (var rx in encounter.Prescriptions.ToList())
            {
                _prescriptionRepository.Remove(rx);
            }
            encounter.Prescriptions.Clear();

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
                    CreatedBy = encounter.DoctorName
                });
            }
        }

        _consultationRepository.Update(encounter);
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
