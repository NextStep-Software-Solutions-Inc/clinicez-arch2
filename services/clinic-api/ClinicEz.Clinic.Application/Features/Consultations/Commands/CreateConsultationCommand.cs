using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
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
    string? Remarks = null,
    string? PhilHealthDrugCode = null);

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
    List<PrescriptionInput>? Prescriptions = null,
    bool IsYakapEligible = false,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? HciCaseNo = null,
    string? HciTransNo = null,
    string? SoapTransNo = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    string? PhysicalExamFindingsJson = null) : IRequest<ConsultationEncounterDto>;

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
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IRepository<ClinicSettings>? _settingsRepository;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;

    public CreateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<ClinicSettings>? settingsRepository = null,
        IPhilHealthSequenceGenerator? sequenceGenerator = null)
    {
        _consultationRepository = consultationRepository;
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _sequenceGenerator = sequenceGenerator;
    }

    public async Task<ConsultationEncounterDto> Handle(CreateConsultationCommand request, CancellationToken cancellationToken)
    {
        string? doctorPrc = null;
        string? doctorPtr = null;
        string? doctorS2 = null;
        string? doctorPan = request.DoctorPhilHealthPan;

        if (_staffRepository != null)
        {
            var doctor = await _staffRepository.Query(s => s.Id == request.DoctorId && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (doctor != null)
            {
                doctorPrc = doctor.PrcLicenseNumber;
                doctorPtr = doctor.PtrNumber;
                doctorS2 = doctor.S2LicenseNumber;
                doctorPan ??= doctor.PhilHealthPan;
            }
        }

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
            DoctorPrcLicense = doctorPrc,
            DoctorPtr = doctorPtr,
            DoctorS2License = doctorS2,
            DoctorPhilHealthPan = doctorPan,
            PhilHealthAtc = request.PhilHealthAtc,
            HciCaseNo = request.HciCaseNo,
            HciTransNo = request.HciTransNo,
            SoapTransNo = request.SoapTransNo,
            GeneralSurveyId = request.GeneralSurveyId,
            GeneralSurveyRemarks = request.GeneralSurveyRemarks,
            PhysicalExamFindingsJson = request.PhysicalExamFindingsJson,
            EncounterDate = DateTime.UtcNow,
            Subjective = request.Subjective ?? string.Empty,
            Objective = request.Objective ?? string.Empty,
            Assessment = request.Assessment ?? string.Empty,
            Plan = request.Plan ?? string.Empty,
            IsYakapEligible = request.IsYakapEligible,
            PhilHealthSignSympCode = request.PhilHealthSignSympCode,
            PhilHealthOtherComplaint = request.PhilHealthOtherComplaint,
            PhilHealthPainSite = request.PhilHealthPainSite,
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
                    PhilHealthDrugCode = rx.PhilHealthDrugCode?.Trim(),
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

        if (encounter.IsYakapEligible && _sequenceGenerator != null && _settingsRepository != null)
        {
            try
            {
                var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                var accreditationNo = !string.IsNullOrWhiteSpace(settings?.AccreditationNumber)
                    ? settings.AccreditationNumber
                    : "000000000";
                var year = encounter.EncounterDate.Year.ToString();
                var journey = await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                    _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    encounter.PatientId,
                    encounter.Id,
                    accreditationNo,
                    year,
                    cancellationToken);

                encounter.HciCaseNo = journey.CaseNumber;
                encounter.PhilHealthCaseNo = journey.CaseNumber;
                encounter.SoapTransNo = journey.SoapTransactionNumber;
                encounter.PhilHealthSoapTransNo = journey.SoapTransactionNumber;
                _consultationRepository.Update(encounter);
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Graceful fallback for offline sequence generation
            }
        }

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
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks, p.PhilHealthDrugCode)).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo ?? encounter.HciCaseNo,
            encounter.PhilHealthSoapTransNo ?? encounter.SoapTransNo,
            encounter.DoctorPhilHealthPan,
            encounter.PhilHealthAtc,
            encounter.HciCaseNo ?? encounter.PhilHealthCaseNo,
            encounter.HciTransNo,
            encounter.SoapTransNo ?? encounter.PhilHealthSoapTransNo,
            encounter.GeneralSurveyId,
            encounter.GeneralSurveyRemarks,
            encounter.PhysicalExamFindingsJson,
            RxPharmacyStatusDto.From(encounter));
    }
}
