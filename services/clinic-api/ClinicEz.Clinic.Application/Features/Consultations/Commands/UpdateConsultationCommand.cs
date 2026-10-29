using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
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
    List<DiagnosisInput>? Diagnoses = null,
    List<PrescriptionInput>? Prescriptions = null,
    string? HomeInstructions = null,
    bool? IsYakapEligible = null,
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
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;

    public UpdateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<EncounterDiagnosis> diagnosisRepository,
        IRepository<PrescriptionItem> prescriptionRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IPhilHealthSequenceGenerator? sequenceGenerator = null)
    {
        _consultationRepository = consultationRepository;
        _diagnosisRepository = diagnosisRepository;
        _prescriptionRepository = prescriptionRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _sequenceGenerator = sequenceGenerator;
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
        if (request.HomeInstructions != null) encounter.HomeInstructions = request.HomeInstructions;
        if (request.IsYakapEligible.HasValue) encounter.IsYakapEligible = request.IsYakapEligible.Value;
        if (request.PhilHealthSignSympCode != null) encounter.PhilHealthSignSympCode = request.PhilHealthSignSympCode;
        if (request.PhilHealthOtherComplaint != null) encounter.PhilHealthOtherComplaint = request.PhilHealthOtherComplaint;
        if (request.PhilHealthPainSite != null) encounter.PhilHealthPainSite = request.PhilHealthPainSite;
        if (request.DoctorPhilHealthPan != null) encounter.DoctorPhilHealthPan = request.DoctorPhilHealthPan;
        if (request.PhilHealthAtc != null) encounter.PhilHealthAtc = request.PhilHealthAtc;
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

        PhilHealthPatientJourneyNumbers? journey = null;
        if (encounter.IsYakapEligible)
        {
            // Auto-snapshot Doctor PhilHealth PAN if not yet set
            if (string.IsNullOrWhiteSpace(encounter.DoctorPhilHealthPan) && _staffRepository != null)
            {
                var doctor = await _staffRepository.Query(s => s.Id == encounter.DoctorId && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (doctor != null && !string.IsNullOrWhiteSpace(doctor.PhilHealthPan))
                {
                    encounter.DoctorPhilHealthPan = doctor.PhilHealthPan;
                }
            }

            // Automatically derive and link pHciCaseNo and pSoapTransNo
            if (_sequenceGenerator != null && _settingsRepository != null &&
                (string.IsNullOrWhiteSpace(encounter.PhilHealthCaseNo) || string.IsNullOrWhiteSpace(encounter.PhilHealthSoapTransNo)))
            {
                try
                {
                    var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
                        .FirstOrDefaultAsync(cancellationToken);
                    var accreditationNo = !string.IsNullOrWhiteSpace(settings?.AccreditationNumber)
                        ? settings.AccreditationNumber
                        : "000000000";
                    var year = encounter.EncounterDate.Year.ToString();
                    journey = await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                        _clinicContext.TenantId,
                        _clinicContext.ClinicId,
                        encounter.PatientId,
                        encounter.Id,
                        accreditationNo,
                        year,
                        cancellationToken);

                    encounter.PhilHealthCaseNo = journey.CaseNumber;
                    encounter.PhilHealthSoapTransNo = journey.SoapTransactionNumber;
                }
                catch
                {
                    // Graceful fallback for offline sequence generation
                }
            }
        }

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
                var newDiag = new EncounterDiagnosis
                {
                    ConsultationEncounterId = encounter.Id,
                    Icd10Code = diag.Icd10Code.Trim().ToUpperInvariant(),
                    Description = diag.Description.Trim(),
                    IsPrimary = diag.IsPrimary,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                encounter.Diagnoses.Add(newDiag);
                await _diagnosisRepository.AddAsync(newDiag, cancellationToken);
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
                var newRx = new PrescriptionItem
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
                    CreatedBy = encounter.DoctorName
                };
                encounter.Prescriptions.Add(newRx);
                await _prescriptionRepository.AddAsync(newRx, cancellationToken);
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
            journey?.EnlistmentTransactionNumber,
            encounter.PhilHealthSoapTransNo,
            encounter.PhysicalExams.FirstOrDefault()?.GenSurveyId,
            encounter.PhysicalExams.FirstOrDefault()?.GeneralSurveyRemarks,
            encounter.GetPhysicalExamFindings() != null ? System.Text.Json.JsonSerializer.Serialize(encounter.GetPhysicalExamFindings()) : null,
            RxPharmacyStatusDto.From(encounter));
    }
}
