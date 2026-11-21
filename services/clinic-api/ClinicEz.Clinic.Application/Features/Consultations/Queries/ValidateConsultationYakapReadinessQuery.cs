using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Queries;

public sealed record ValidateConsultationYakapReadinessQuery(Guid ConsultationId) : IRequest<YakapClaimReadinessDto>;

public sealed class ValidateConsultationYakapReadinessQueryValidator : AbstractValidator<ValidateConsultationYakapReadinessQuery>
{
    public ValidateConsultationYakapReadinessQueryValidator()
    {
        RuleFor(x => x.ConsultationId).NotEmpty();
    }
}

public sealed class ValidateConsultationYakapReadinessQueryHandler : IRequestHandler<ValidateConsultationYakapReadinessQuery, YakapClaimReadinessDto>
{
    private static readonly Regex PinRegex = new(@"^\d{2}-\d{9}-\d{1}$", RegexOptions.Compiled);

    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<Patient> _patientRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<PatientVitals> _vitalsRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IPhilHealthCatalogLookup? _catalogLookup;

    public ValidateConsultationYakapReadinessQueryHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<Patient> patientRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<PatientVitals> vitalsRepository,
        IClinicContext clinicContext,
        IPhilHealthCatalogLookup? catalogLookup = null)
    {
        _consultationRepository = consultationRepository;
        _patientRepository = patientRepository;
        _staffRepository = staffRepository;
        _vitalsRepository = vitalsRepository;
        _clinicContext = clinicContext;
        _catalogLookup = catalogLookup;
    }

    public async Task<YakapClaimReadinessDto> Handle(ValidateConsultationYakapReadinessQuery request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository.Query(c => c.Id == request.ConsultationId && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .Include(c => c.PhysicalExams)
                .ThenInclude(p => p.Findings)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Consultation encounter '{request.ConsultationId}' was not found in this clinic.");
        }

        var doctor = await _staffRepository.Query(s => s.Id == encounter.DoctorId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        var patient = await _patientRepository.Query(p => p.Id == encounter.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        var vitals = await _vitalsRepository.Query(v =>
            (encounter.QueueItemId.HasValue && v.QueueItemId == encounter.QueueItemId.Value) ||
            v.PatientId == encounter.PatientId)
            .OrderByDescending(v => v.RecordedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var missingFields = new List<string>();
        var warnings = new List<string>();

        // 1. Doctor PAN
        var doctorPan = !string.IsNullOrWhiteSpace(encounter.DoctorPhilHealthPan)
            ? encounter.DoctorPhilHealthPan
            : doctor?.PhilHealthPan;
        bool doctorPanValid = !string.IsNullOrWhiteSpace(doctorPan);
        if (!doctorPanValid)
        {
            missingFields.Add("Doctor PhilHealth Accreditation Number (PAN) is missing.");
        }

        // 2. Doctor PRC
        var doctorPrc = !string.IsNullOrWhiteSpace(encounter.DoctorPrcLicense)
            ? encounter.DoctorPrcLicense
            : doctor?.PrcLicenseNumber;
        bool doctorPrcValid = !string.IsNullOrWhiteSpace(doctorPrc);
        if (!doctorPrcValid)
        {
            missingFields.Add("Doctor PRC License Number is missing.");
        }

        // 3. Patient PIN (RA 11223: 12-digit format XX-XXXXXXXXX-X or 12 digits)
        string? rawPin = patient?.PhilHealthNumber;
        bool patientPinValid = false;
        if (string.IsNullOrWhiteSpace(rawPin))
        {
            missingFields.Add("Patient PhilHealth Identification Number (PIN) is missing.");
        }
        else
        {
            var cleanedPin = new string(rawPin.Where(char.IsDigit).ToArray());
            if (cleanedPin.Length == 12)
            {
                patientPinValid = true;
                if (!PinRegex.IsMatch(rawPin))
                {
                    warnings.Add($"Patient PIN '{rawPin}' does not follow standard XX-XXXXXXXXX-X hyphenation but contains 12 digits.");
                }
            }
            else
            {
                missingFields.Add($"Patient PhilHealth PIN '{rawPin}' is invalid (must contain exactly 12 numeric digits).");
            }
        }

        // 4. ATC (Authorization Transaction Code / Appointment Transaction Code)
        var atc = encounter.PhilHealthAtc;
        bool atcValid = !string.IsNullOrWhiteSpace(atc);
        if (!atcValid)
        {
            missingFields.Add("PhilHealth Authorization Transaction Code (ATC) is missing.");
        }

        // 5. Symptoms & Complaints (lib_signs_symptoms)
        bool symptomsValid = true;
        if (string.IsNullOrWhiteSpace(encounter.PhilHealthSignSympCode))
        {
            symptomsValid = false;
            missingFields.Add("PhilHealth Signs & Symptoms statutory code is missing.");
        }
        else
        {
            var code = encounter.PhilHealthSignSympCode.Trim();
            if (code == "38" && string.IsNullOrWhiteSpace(encounter.PhilHealthPainSite))
            {
                symptomsValid = false;
                missingFields.Add("Mandatory pain site description is missing for chief complaint code '38' (PAIN).");
            }
            if ((code == "X" || code.Equals("OTHERS", StringComparison.OrdinalIgnoreCase)) &&
                string.IsNullOrWhiteSpace(encounter.PhilHealthOtherComplaint))
            {
                symptomsValid = false;
                missingFields.Add("Mandatory other complaint description is missing for chief complaint code 'X' (OTHERS).");
            }
        }

        // 6. 9-System Physical Examination & General Survey
        bool generalSurveyValid = true;
        var physicalExam = encounter.PhysicalExams.FirstOrDefault();
        var generalSurveyId = physicalExam?.GenSurveyId;
        var generalSurveyRemarks = physicalExam?.GeneralSurveyRemarks;
        if (string.IsNullOrWhiteSpace(generalSurveyId))
        {
            generalSurveyValid = false;
            missingFields.Add("General Survey evaluation is missing.");
        }
        else if (generalSurveyId == "2" && string.IsNullOrWhiteSpace(generalSurveyRemarks))
        {
            generalSurveyValid = false;
            missingFields.Add("General Survey remarks are mandatory when marked abnormal (code 2).");
        }

        bool peSystemsValid = true;
        var peFindings = encounter.GetPhysicalExamFindings();
        if (peFindings == null)
        {
            peSystemsValid = false;
            missingFields.Add("9-System Physical Examination checklist is incomplete. Please complete findings or apply 'All Essentially Normal'.");
        }
        else
        {
            // Validate abnormal systems provide remarks per DTD PESPECIFIC
            if (!peFindings.Skin.IsNormal && string.IsNullOrWhiteSpace(peFindings.Skin.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Skin finding.");
            }
            if (!peFindings.Heent.IsNormal && string.IsNullOrWhiteSpace(peFindings.Heent.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal HEENT finding.");
            }
            if (!peFindings.Chest.IsNormal && string.IsNullOrWhiteSpace(peFindings.Chest.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Chest finding.");
            }
            if (!peFindings.Heart.IsNormal && string.IsNullOrWhiteSpace(peFindings.Heart.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Heart finding.");
            }
            if (!peFindings.Abdomen.IsNormal && string.IsNullOrWhiteSpace(peFindings.Abdomen.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Abdomen finding.");
            }
            if (!peFindings.Neuro.IsNormal && string.IsNullOrWhiteSpace(peFindings.Neuro.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Neurological finding.");
            }
            if (!peFindings.Rectal.IsNormal && string.IsNullOrWhiteSpace(peFindings.Rectal.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Rectal finding.");
            }
            if (!peFindings.Gu.IsNormal && string.IsNullOrWhiteSpace(peFindings.Gu.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Genitourinary finding.");
            }
            if (!peFindings.Musculoskeletal.IsNormal && string.IsNullOrWhiteSpace(peFindings.Musculoskeletal.Remarks))
            {
                peSystemsValid = false;
                missingFields.Add("Physical exam remarks required for abnormal Musculoskeletal finding.");
            }
        }
        bool physicalExamComplete = generalSurveyValid && peSystemsValid;

        // 7. Primary ICD-10 Diagnosis
        bool primaryDiagPresent = false;
        if (encounter.Diagnoses.Count == 0)
        {
            missingFields.Add("Primary ICD-10 diagnosis is missing.");
        }
        else
        {
            var primary = encounter.Diagnoses.FirstOrDefault(d => d.IsPrimary);
            if (primary != null && !string.IsNullOrWhiteSpace(primary.Icd10Code))
            {
                primaryDiagPresent = true;
            }
            else if (encounter.Diagnoses.Count == 1 && !string.IsNullOrWhiteSpace(encounter.Diagnoses.First().Icd10Code))
            {
                primaryDiagPresent = true;
                warnings.Add("Only one diagnosis recorded; treated as primary ICD-10 diagnosis.");
            }
            else
            {
                missingFields.Add("No diagnosis is explicitly designated as the primary ICD-10 diagnosis.");
            }
        }

        // 8. Vital Signs Completeness
        bool vitalsComplete = true;
        if (vitals == null)
        {
            vitalsComplete = false;
            missingFields.Add("Vital signs record is missing for this consultation.");
        }
        else
        {
            bool isInfant = false;
            if (patient != null)
            {
                var encDate = encounter.EncounterDate;
                var birthDate = patient.DateOfBirth;
                int ageMonths = (encDate.Year - birthDate.Year) * 12 + encDate.Month - birthDate.Month;
                if (encDate.Day < birthDate.Day)
                    ageMonths--;
                if (ageMonths <= 24)
                    isInfant = true;
            }

            var missingVitalsList = new List<string>();
            if (!isInfant)
            {
                if (!vitals.SystolicBp.HasValue || vitals.SystolicBp <= 0) missingVitalsList.Add("Systolic BP");
                if (!vitals.DiastolicBp.HasValue || vitals.DiastolicBp <= 0) missingVitalsList.Add("Diastolic BP");
                if (!vitals.HeightCm.HasValue || vitals.HeightCm <= 0) missingVitalsList.Add("Height");
            }
            else
            {
                var effectiveLength = vitals.BodyLengthCm ?? vitals.HeightCm;
                if (!effectiveLength.HasValue || effectiveLength <= 0) missingVitalsList.Add("Body Length / Height");
            }

            if (!vitals.HeartRateBpm.HasValue || vitals.HeartRateBpm <= 0) missingVitalsList.Add("Heart Rate");
            if (!vitals.RespiratoryRateBreathsPerMin.HasValue) missingVitalsList.Add("Respiratory Rate");
            if (!vitals.TemperatureCelsius.HasValue || vitals.TemperatureCelsius <= 0) missingVitalsList.Add("Temperature");
            if (!vitals.WeightKg.HasValue || vitals.WeightKg <= 0) missingVitalsList.Add("Weight");

            if (missingVitalsList.Count > 0)
            {
                vitalsComplete = false;
                missingFields.Add($"Vital signs incomplete: {string.Join(", ", missingVitalsList)}.");
            }
        }

        // 9. Medicines & Controlled Drugs
        bool medicinesValid = true;
        bool s2Valid = true;

        if (encounter.Prescriptions.Count == 0)
        {
            medicinesValid = true;
            warnings.Add("Zero prescriptions recorded; encounter will transmit statutory fallback code NOMED (No Medication Needed).");
        }
        else
        {
            foreach (var rx in encounter.Prescriptions)
            {
                bool hasCode = !string.IsNullOrWhiteSpace(rx.PhilHealthDrugCode) && rx.PhilHealthDrugCode.Length >= 29 && rx.PhilHealthDrugCode.Length <= 30;
                if (!hasCode && _catalogLookup != null)
                {
                    var drugItem = _catalogLookup.FindByDescription("lib_drugs", rx.GenericName)
                        ?? _catalogLookup.FindByDescription("lib_medicines", rx.GenericName);
                    var resolved = drugItem?.Code;
                    hasCode = !string.IsNullOrWhiteSpace(resolved) && resolved.Length >= 29 && resolved.Length <= 30;
                }

                if (!hasCode)
                {
                    medicinesValid = false;
                    missingFields.Add($"Prescription '{rx.GenericName} {rx.Dosage}' does not have a valid 30-character PhilHealth drug code.");
                }

                if (rx.IsDangerousDrug)
                {
                    var s2 = !string.IsNullOrWhiteSpace(encounter.DoctorS2License)
                        ? encounter.DoctorS2License
                        : doctor?.S2LicenseNumber;
                    if (string.IsNullOrWhiteSpace(s2))
                    {
                        s2Valid = false;
                        missingFields.Add($"Prescription '{rx.GenericName}' is a PDEA controlled drug, but Doctor S2 License number is missing.");
                    }
                }
            }
        }

        // 10. Overall Claim Readiness Determination
        bool isReady = doctorPanValid &&
                       doctorPrcValid &&
                       patientPinValid &&
                       atcValid &&
                       symptomsValid &&
                       physicalExamComplete &&
                       primaryDiagPresent &&
                       vitalsComplete &&
                       medicinesValid &&
                       s2Valid;

        return new YakapClaimReadinessDto(
            IsReady: isReady,
            EncounterId: encounter.Id,
            DoctorPanValid: doctorPanValid,
            DoctorPrcValid: doctorPrcValid,
            PatientPinValid: patientPinValid,
            AtcValid: atcValid,
            SymptomsValid: symptomsValid,
            PhysicalExamComplete: physicalExamComplete,
            PrimaryDiagnosisPresent: primaryDiagPresent,
            VitalsComplete: vitalsComplete,
            MedicinesValid: medicinesValid,
            MissingFields: missingFields,
            Warnings: warnings,
            GeneralSurveyValid: generalSurveyValid,
            S2LicenseValid: s2Valid);
    }
}
