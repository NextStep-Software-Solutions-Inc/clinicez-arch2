using System.Globalization;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>The part of a patient's record a grant covers, shaped for the interop contract.</summary>
public sealed record PatientShareContent(ShareDemographicsDto? Demographics, List<ShareItemDto> Items);

/// <summary>Builds the scoped snapshot a facility receives when it redeems a share token: only the categories the patient ticked.</summary>
public sealed class PatientShareSnapshotBuilder
{
    private const int MaxVitals = 20;
    private const int MaxDocuments = 50;
    private const int MaxDetailLength = 1000;

    private readonly IPatientRepository _patients;
    private readonly IPatientDocumentRepository _documents;

    public PatientShareSnapshotBuilder(IPatientRepository patients, IPatientDocumentRepository documents)
    {
        _patients = patients;
        _documents = documents;
    }

    public async Task<PatientShareContent?> BuildAsync(Guid patientId, SharingScopes scopes, CancellationToken cancellationToken)
    {
        var patient = await _patients.GetWithProfileAsync(patientId, cancellationToken);
        if (patient is null)
            return null;

        var items = new List<ShareItemDto>();

        if (scopes.HasFlag(SharingScopes.Allergies))
            items.AddRange(patient.Allergies.Select(a => Item(
                "allergy", a.AllergenName, Detail(a.Severity.ToString(), a.Reaction), null)));

        if (scopes.HasFlag(SharingScopes.Medications))
            items.AddRange(patient.Medications.Where(m => m.IsCurrentlyTaking).Select(m => Item(
                "medication", m.MedicationName, Detail(m.Dosage, m.Frequency, m.Route), null)));

        if (scopes.HasFlag(SharingScopes.Conditions))
        {
            items.AddRange(patient.ChronicConditions.Select(c => Item(
                "condition", c.ConditionName, Detail("Chronic", c.IsControlled ? "controlled" : "not controlled", c.TreatmentNotes), AtStartOfDay(c.DiagnosedAt))));
            items.AddRange(patient.PastIllnesses.Select(i => Item(
                "condition", i.IllnessName, Detail("Past illness", i.TreatmentReceived), AtStartOfDay(i.DiagnosedAt))));
        }

        if (scopes.HasFlag(SharingScopes.Immunizations))
        {
            items.AddRange(patient.ImmunizationsSelf.Select(i => Item(
                "immunization", i.VaccineName, Detail(i.DoseNumber is null ? null : $"dose {i.DoseNumber}", "self-reported"), AtStartOfDay(i.Date))));
            var administered = await _patients.GetVaccinationsAdministeredAsync(patientId, cancellationToken);
            items.AddRange(administered.Select(v => Item(
                "immunization", v.VaccineName, Detail(v.DoseNumber is null ? null : $"dose {v.DoseNumber}", v.Facility), AtStartOfDay(v.DateAdministered))));
        }

        if (scopes.HasFlag(SharingScopes.LabResults))
        {
            var reports = await _documents.GetLabReportsAsync(patientId, cancellationToken);
            items.AddRange(reports.Take(MaxDocuments).Select(ReportItem));
        }

        if (scopes.HasFlag(SharingScopes.Prescriptions))
        {
            var prescriptions = await _documents.GetPrescriptionsAsync(patientId, cancellationToken);
            items.AddRange(prescriptions.Take(MaxDocuments).Select(PrescriptionItem));
        }

        if (scopes.HasFlag(SharingScopes.Vitals))
        {
            var vitals = await _patients.GetRecentVitalsAsync(patientId, MaxVitals, cancellationToken);
            items.AddRange(vitals.Select(v => Item("vital", "Vital signs", VitalsDetail(v), v.RecordedAt)));
        }

        return new PatientShareContent(
            scopes.HasFlag(SharingScopes.Demographics) ? Demographics(patient) : null,
            items);
    }

    private static ShareDemographicsDto Demographics(Domain.Entities.Patient patient)
    {
        var address = patient.Addresses.FirstOrDefault(a => a.IsPrimary) ?? patient.Addresses.FirstOrDefault();

        return new ShareDemographicsDto
        {
            FirstName = patient.FirstName,
            MiddleName = patient.MiddleName,
            LastName = patient.LastName,
            Suffix = patient.Suffix,
            FullName = Join(" ", patient.FirstName, patient.MiddleName, patient.LastName, patient.Suffix) ?? string.Empty,
            DateOfBirth = patient.DateOfBirth?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Sex = patient.Sex?.ToString(),
            MobileNumber = patient.Mobile,
            Email = patient.Email,
            Address = address is null
                ? null
                : Join(", ", address.HouseStreet, address.Barangay, address.CityMunicipality, address.Province, address.ZipCode),
            PhilHealthPin = patient.GovernmentIds.FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth)?.IdNumber
        };
    }

    private static ShareItemDto ReportItem(LabResultReport report)
    {
        var analytes = report.Observations
            .Select(o => $"{o.TestName} {o.Result} {o.Unit}".Trim() + (string.IsNullOrEmpty(o.Flag) || o.Flag == "Normal" ? string.Empty : $" ({o.Flag})"));

        var detail = Join("; ", $"{report.LaboratoryName}, {report.Verification.ToString().ToLowerInvariant()}", report.Impression, string.Join(", ", analytes));
        return Item("labResult", report.Title, detail, report.ResultedAt);
    }

    private static ShareItemDto PrescriptionItem(PrescriptionDocument rx)
    {
        var medicines = string.Join(", ", rx.Lines.OrderBy(l => l.SortOrder).Select(l => Join(" ", l.GenericName ?? l.MedicationName, l.Dosage)));
        return Item(
            "prescription",
            Join(": ", rx.PrescriptionNumber, medicines) ?? "Prescription",
            Join(", ", rx.OrderingFacilityName, rx.PrescriberName, rx.Stage.ToString()),
            rx.IssuedAt);
    }

    private static string? VitalsDetail(VitalSigns v) => Join(", ",
        v.SystolicBp is not null && v.DiastolicBp is not null ? $"BP {v.SystolicBp}/{v.DiastolicBp}" : null,
        v.HeartRateBpm is { } hr ? $"HR {hr}" : null,
        v.TemperatureCelsius is { } t ? $"Temp {t.ToString("0.#", CultureInfo.InvariantCulture)} C" : null,
        v.OxygenSaturationPercent is { } o ? $"SpO2 {o.ToString("0.#", CultureInfo.InvariantCulture)}%" : null,
        v.RespiratoryRateBreathsPerMin is { } rr ? $"RR {rr}" : null,
        v.WeightKg is { } w ? $"Wt {w.ToString("0.#", CultureInfo.InvariantCulture)} kg" : null,
        v.HeightCm is { } h ? $"Ht {h.ToString("0.#", CultureInfo.InvariantCulture)} cm" : null);

    private static ShareItemDto Item(string kind, string name, string? detail, DateTime? recordedAtUtc) => new()
    {
        Kind = kind,
        Name = name,
        Detail = detail is { Length: > MaxDetailLength } ? detail[..MaxDetailLength] : detail,
        RecordedAtUtc = recordedAtUtc
    };

    private static DateTime? AtStartOfDay(DateOnly? date) =>
        date?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

    private static DateTime? AtStartOfDay(DateOnly date) => AtStartOfDay((DateOnly?)date);

    private static string? Detail(params string?[] parts) => Join(", ", parts);

    private static string? Join(string separator, params string?[] parts)
    {
        var present = parts.Where(p => !string.IsNullOrWhiteSpace(p)).ToList();
        return present.Count == 0 ? null : string.Join(separator, present);
    }
}
