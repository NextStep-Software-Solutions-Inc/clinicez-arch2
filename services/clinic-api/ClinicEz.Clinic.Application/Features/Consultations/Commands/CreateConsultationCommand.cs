using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
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
    string? HomeInstructions = null,
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
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;

    public CreateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<FacilitySettings>? settingsRepository = null,
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

        ConsultationEncounter? encounter = null;

        if (request.QueueItemId.HasValue)
        {
            encounter = await _consultationRepository
                .Query(c => c.QueueItemId == request.QueueItemId.Value && c.ClinicId == _clinicContext.ClinicId)
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .FirstOrDefaultAsync(cancellationToken);

            if (encounter != null && encounter.IsSigned)
            {
                throw new ConflictException("A consultation encounter for this queue visit has already been signed and locked.");
            }
        }

        if (encounter != null)
        {
            encounter.AppointmentId = request.AppointmentId ?? encounter.AppointmentId;
            encounter.PatientId = request.PatientId;
            encounter.PatientName = request.PatientName.Trim();
            encounter.DoctorId = request.DoctorId;
            encounter.DoctorName = request.DoctorName.Trim();
            encounter.DoctorPrcLicense = doctorPrc ?? encounter.DoctorPrcLicense;
            encounter.DoctorPtr = doctorPtr ?? encounter.DoctorPtr;
            encounter.DoctorS2License = doctorS2 ?? encounter.DoctorS2License;
            encounter.DoctorPhilHealthPan = doctorPan ?? encounter.DoctorPhilHealthPan;
            encounter.PhilHealthAtc = request.PhilHealthAtc ?? encounter.PhilHealthAtc;
            if (request.HciCaseNo != null) encounter.PhilHealthCaseNo = request.HciCaseNo;
            if (request.SoapTransNo != null) encounter.PhilHealthSoapTransNo = request.SoapTransNo;
            if (request.GeneralSurveyId != null || request.GeneralSurveyRemarks != null || !string.IsNullOrWhiteSpace(request.PhysicalExamFindingsJson))
            {
                var exam = encounter.PhysicalExams.FirstOrDefault();
                if (exam == null)
                {
                    exam = new PatientPhysicalExam
                    {
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        PatientId = encounter.PatientId,
                        ConsultationEncounterId = encounter.Id,
                        ExamDate = encounter.EncounterDate != default ? encounter.EncounterDate : DateTime.UtcNow
                    };
                    encounter.PhysicalExams.Add(exam);
                }
                if (request.GeneralSurveyId != null) exam.GenSurveyId = request.GeneralSurveyId;
                if (request.GeneralSurveyRemarks != null) exam.GeneralSurveyRemarks = request.GeneralSurveyRemarks;
                if (!string.IsNullOrWhiteSpace(request.PhysicalExamFindingsJson))
                {
                    try
                    {
                        var pe = System.Text.Json.JsonSerializer.Deserialize<NineSystemPhysicalExamFindings>(request.PhysicalExamFindingsJson);
                        encounter.SetPhysicalExamFindings(pe);
                    }
                    catch { }
                }
            }
            encounter.Subjective = request.Subjective ?? string.Empty;
            encounter.Objective = request.Objective ?? string.Empty;
            encounter.Assessment = request.Assessment ?? string.Empty;
            encounter.Plan = request.Plan ?? string.Empty;
            if (request.HomeInstructions != null) encounter.HomeInstructions = request.HomeInstructions;
            encounter.IsYakapEligible = request.IsYakapEligible;
            encounter.PhilHealthSignSympCode = request.PhilHealthSignSympCode;
            encounter.PhilHealthOtherComplaint = request.PhilHealthOtherComplaint;
            encounter.PhilHealthPainSite = request.PhilHealthPainSite;
            encounter.UpdatedAt = DateTime.UtcNow;
            encounter.UpdatedBy = request.DoctorName.Trim();

            encounter.Diagnoses.Clear();
            if (request.Diagnoses != null)
            {
                foreach (var diag in request.Diagnoses)
                {
                    encounter.Diagnoses.Add(new EncounterDiagnosis
                    {
                        ConsultationEncounterId = encounter.Id,
                        Icd10Code = diag.Icd10Code.Trim().ToUpperInvariant(),
                        Description = diag.Description.Trim(),
                        IsPrimary = diag.IsPrimary,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = request.DoctorName
                    });
                }
            }

            encounter.Prescriptions.Clear();
            if (request.Prescriptions != null)
            {
                foreach (var rx in request.Prescriptions)
                {
                    encounter.Prescriptions.Add(new PrescriptionItem
                    {
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
        }
        else
        {
            encounter = new ConsultationEncounter
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
                PhilHealthCaseNo = request.HciCaseNo,
                PhilHealthSoapTransNo = request.SoapTransNo,
                EncounterDate = DateTime.UtcNow,
                Subjective = request.Subjective ?? string.Empty,
                Objective = request.Objective ?? string.Empty,
                Assessment = request.Assessment ?? string.Empty,
                Plan = request.Plan ?? string.Empty,
                HomeInstructions = request.HomeInstructions,
                IsYakapEligible = request.IsYakapEligible,
                PhilHealthSignSympCode = request.PhilHealthSignSympCode,
                PhilHealthOtherComplaint = request.PhilHealthOtherComplaint,
                PhilHealthPainSite = request.PhilHealthPainSite,
                IsSigned = false,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = request.DoctorName
            };

            if (request.GeneralSurveyId != null || request.GeneralSurveyRemarks != null || !string.IsNullOrWhiteSpace(request.PhysicalExamFindingsJson))
            {
                var exam = new PatientPhysicalExam
                {
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    PatientId = encounter.PatientId,
                    ConsultationEncounterId = encounter.Id,
                    ExamDate = DateTime.UtcNow,
                    GenSurveyId = request.GeneralSurveyId,
                    GeneralSurveyRemarks = request.GeneralSurveyRemarks
                };
                encounter.PhysicalExams.Add(exam);
                if (!string.IsNullOrWhiteSpace(request.PhysicalExamFindingsJson))
                {
                    try
                    {
                        var pe = System.Text.Json.JsonSerializer.Deserialize<NineSystemPhysicalExamFindings>(request.PhysicalExamFindingsJson);
                        encounter.SetPhysicalExamFindings(pe);
                    }
                    catch { }
                }
            }

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
        }

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

                encounter.PhilHealthCaseNo = journey.CaseNumber;
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
            encounter.HomeInstructions,
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
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo,
            encounter.DoctorPhilHealthPan,
            encounter.PhilHealthAtc,
            encounter.PhilHealthCaseNo,
            null,
            encounter.PhilHealthSoapTransNo,
            encounter.PhysicalExams.FirstOrDefault()?.GenSurveyId,
            encounter.PhysicalExams.FirstOrDefault()?.GeneralSurveyRemarks,
            encounter.GetPhysicalExamFindings() != null ? System.Text.Json.JsonSerializer.Serialize(encounter.GetPhysicalExamFindings()) : null,
            RxPharmacyStatusDto.From(encounter));
    }
}
