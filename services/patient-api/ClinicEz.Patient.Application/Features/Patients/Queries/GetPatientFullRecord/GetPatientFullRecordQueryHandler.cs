using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientFullRecord;

public sealed class GetPatientFullRecordQueryHandler
    : IRequestHandler<GetPatientFullRecordQuery, PatientFullRecordDto>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientFullRecordQueryHandler(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public async Task<PatientFullRecordDto> Handle(
        GetPatientFullRecordQuery request, CancellationToken cancellationToken)
    {
        var p = await _patientRepository.GetWithProfileAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        // ── Demographics ─────────────────────────────────────────────────────
        var demographics = new PatientSummaryDto(
            p.Id,
            p.FirstName, p.MiddleName, p.LastName, p.Suffix,
            p.Sex?.ToString(), p.DateOfBirth, p.PlaceOfBirth,
            p.BloodType?.ToString(), p.CivilStatus?.ToString(),
            p.Nationality, p.Ethnicity, p.Religion, p.PrimaryLanguage,
            p.EducationLevel?.ToString(),
            p.Mobile, p.AltPhone, p.Email, p.MessengerHandle,
            p.AvatarUrl,
            p.ConsentToShareInfo);

        // ── Contact & identifiers ────────────────────────────────────────────
        var govIds = p.GovernmentIds
            .Select(g => new PatientGovernmentIdDto(g.Id, g.ClientId,
                g.IdType.ToString(), g.IdNumber, g.IssuedAt, g.ExpiresAt, g.UpdatedAt))
            .ToList().AsReadOnly();

        var addresses = p.Addresses
            .Select(a => new PatientAddressDto(a.Id, a.ClientId,
                a.Type.ToString(), a.HouseStreet, a.Barangay, a.CityMunicipality,
                a.Province, a.Region, a.ZipCode, a.Country, a.IsPrimary, a.UpdatedAt))
            .ToList().AsReadOnly();

        var contacts = p.EmergencyContacts
            .Select(e => new EmergencyContactDto(e.Id, e.ClientId,
                e.FullName, e.Relationship, e.Mobile, e.AltPhone, e.IsPrimary, e.UpdatedAt))
            .ToList().AsReadOnly();

        var providers = p.HealthcareProviders
            .Select(h => new PatientHealthcareProviderDto(h.Id, h.ClientId,
                h.ProviderType.ToString(), h.Name, h.Specialty, h.ClinicHospital, h.Phone, h.UpdatedAt))
            .ToList().AsReadOnly();

        // ── Medical history ──────────────────────────────────────────────────
        var allergies = p.Allergies
            .Select(a => new PatientAllergyDto(a.Id, a.ClientId,
                a.AllergenName, a.AllergyType.ToString(), a.Severity.ToString(),
                a.Reaction, a.OnsetDate, a.Notes, a.UpdatedAt))
            .ToList().AsReadOnly();

        var medications = p.Medications
            .Select(m => new PatientMedicationDto(m.Id, m.ClientId,
                m.MedicationName, m.GenericName, m.Dosage, m.Frequency, m.Route,
                m.StartDate, m.EndDate, m.IsCurrentlyTaking, m.PrescribedBy, m.Purpose, m.Notes,
                m.UpdatedAt))
            .ToList().AsReadOnly();

        var surgeries = p.SurgicalHistories
            .Select(s => new PatientSurgicalHistoryDto(s.Id, s.ClientId,
                s.ProcedureName, s.SurgeonName, s.Hospital,
                s.SurgeryDate, s.AnesthesiaType, s.Complications, s.Notes, s.UpdatedAt))
            .ToList().AsReadOnly();

        var illnesses = p.PastIllnesses
            .Select(i => new PatientPastIllnessDto(i.Id, i.ClientId,
                i.IllnessName, i.DiagnosedAt, i.ResolvedAt, i.TreatmentReceived, i.Notes, i.UpdatedAt))
            .ToList().AsReadOnly();

        var chronic = p.ChronicConditions
            .Select(c => new PatientChronicConditionDto(c.Id, c.ClientId,
                c.ConditionName, c.DiagnosedAt, c.IsControlled, c.TreatmentNotes, c.CurrentMedications,
                c.UpdatedAt))
            .ToList().AsReadOnly();

        var family = p.FamilyHistories
            .Select(f => new PatientFamilyHistoryDto(f.Id, f.ClientId,
                f.Relation.ToString(), f.ConditionName, f.AgeOfOnset, f.IsDeceased, f.Notes, f.UpdatedAt))
            .ToList().AsReadOnly();

        var immunizations = p.ImmunizationsSelf
            .Select(i => new PatientImmunizationSelfDto(i.Id, i.ClientId,
                i.ImmunizationCategory?.ToString(), i.VaccineName,
                i.DoseNumber, i.LotNumber, i.Date, i.AdministeredBy, i.UpdatedAt))
            .ToList().AsReadOnly();

        var disabilities = p.Disabilities
            .Select(d => new PatientDisabilityDto(d.Id, d.ClientId,
                d.BodyPart, d.Classification, d.IsPwdCertified, d.UpdatedAt))
            .ToList().AsReadOnly();

        var travel = p.TravelHistories
            .Select(t => new PatientTravelHistoryDto(t.Id, t.ClientId,
                t.Destination, t.CityProvince, t.DepartureDate, t.ReturnDate,
                t.Purpose?.ToString(), t.IllnessDuringAfterTravel, t.UpdatedAt))
            .ToList().AsReadOnly();

        var contraceptives = p.ContraceptiveHistories
            .Select(c => new PatientContraceptiveHistoryDto(c.Id, c.ClientId,
                c.Method, c.IsCurrent, c.DateStarted, c.ReasonForStopping, c.UpdatedAt))
            .ToList().AsReadOnly();

        var pregnancies = p.Pregnancies
            .Select(pg => new PatientPregnancyDto(pg.Id, pg.ClientId,
                pg.Year, pg.Outcome, pg.GestationalAgeWeeks,
                pg.DeliveryType, pg.BirthWeightKg, pg.Complications, pg.Facility, pg.UpdatedAt))
            .ToList().AsReadOnly();

        // ── One-to-one profiles ──────────────────────────────────────────────
        var social = p.SocialHistory is null ? null : new PatientSocialHistoryDto(
            p.SocialHistory.Id, p.SocialHistory.ClientId,
            p.SocialHistory.SmokingStatus?.ToString(), p.SocialHistory.CigsPerDay, p.SocialHistory.PackYears,
            p.SocialHistory.QuitDate, p.SocialHistory.OtherTobaccoProducts,
            p.SocialHistory.AlcoholUse?.ToString(), p.SocialHistory.AlcoholType,
            p.SocialHistory.AlcoholFrequencyDaysPerWeek, p.SocialHistory.AlcoholQuantityPerOccasion,
            p.SocialHistory.UsesSubstances, p.SocialHistory.SubstanceName,
            p.SocialHistory.SubstanceRoute, p.SocialHistory.SubstanceFrequency,
            p.SocialHistory.ActivityLevel?.ToString(), p.SocialHistory.ExerciseType,
            p.SocialHistory.ExerciseFrequencyDaysPerWeek,
            p.SocialHistory.DietPattern, p.SocialHistory.FoodRestrictions,
            p.SocialHistory.SleepAvgHours, p.SocialHistory.SleepQuality?.ToString(),
            p.SocialHistory.IsSexuallyActive, p.SocialHistory.WaterIntake,
            p.SocialHistory.OccupationalHazards, p.SocialHistory.UpdatedAt);

        var occupation = p.Occupation is null ? null : new PatientOccupationDto(
            p.Occupation.Id, p.Occupation.ClientId,
            p.Occupation.Occupation, p.Occupation.Employer, p.Occupation.Industry,
            p.Occupation.WorkEnvironment?.ToString(), p.Occupation.YearsInOccupation,
            p.Occupation.HazardExposure, p.Occupation.UpdatedAt);

        var obstetric = p.ObstetricProfile is null ? null : new PatientObstetricProfileDto(
            p.ObstetricProfile.Id, p.ObstetricProfile.ClientId,
            p.ObstetricProfile.Gravida, p.ObstetricProfile.Para,
            p.ObstetricProfile.AbortusCount, p.ObstetricProfile.LivingChildren,
            p.ObstetricProfile.LastMenstrualPeriod, p.ObstetricProfile.Menarche,
            p.ObstetricProfile.IsPregnant, p.ObstetricProfile.MenstrualCycleLengthDays,
            p.ObstetricProfile.HasDysmenorrhea, p.ObstetricProfile.Notes, p.ObstetricProfile.UpdatedAt);

        var maleRepro = p.MaleReproductive is null ? null : new PatientMaleReproductiveDto(
            p.MaleReproductive.Id, p.MaleReproductive.ClientId,
            p.MaleReproductive.HasVasectomy, p.MaleReproductive.VasectomyDate,
            p.MaleReproductive.Conditions, p.MaleReproductive.UpdatedAt);

        var dental = p.DentalVision is null ? null : new PatientDentalVisionDto(
            p.DentalVision.Id, p.DentalVision.ClientId,
            p.DentalVision.DentistName, p.DentalVision.DentistClinic, p.DentalVision.OrthodonticDevice,
            p.DentalVision.EyeDoctorName, p.DentalVision.CorrectiveLenses?.ToString(),
            p.DentalVision.UpdatedAt);

        var mental = p.MentalHealthProfile is null ? null : new PatientMentalHealthProfileDto(
            p.MentalHealthProfile.Id, p.MentalHealthProfile.ClientId,
            p.MentalHealthProfile.HasDiagnosis, p.MentalHealthProfile.DiagnosisName,
            p.MentalHealthProfile.IsOnMedication, p.MentalHealthProfile.MedicationName,
            p.MentalHealthProfile.TherapistName, p.MentalHealthProfile.TherapyType,
            p.MentalHealthProfile.SessionFrequency, p.MentalHealthProfile.Notes,
            p.MentalHealthProfile.UpdatedAt);

        return new PatientFullRecordDto(
            demographics,
            govIds, addresses, contacts, providers,
            allergies, medications, surgeries, illnesses, chronic,
            family, immunizations, disabilities, travel, contraceptives, pregnancies,
            social, occupation, obstetric, maleRepro, dental, mental);
    }
}
