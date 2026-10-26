using System.Collections.Generic;

namespace ClinicEz.Clinic.Domain.Enums;

/// <summary>
/// Appointment clinical modality classification.
/// </summary>
public enum AppointmentType
{
    InPerson = 0,
    Teleconsult = 1
}

/// <summary>
/// Teleconsultation payment state tracking.
/// </summary>
public enum TeleconsultPaymentStatus
{
    Pending = 0,
    Paid = 1,
    Exempt = 2,
    Overridden = 3
}

/// <summary>
/// Standardized statutory and clinical emergency override reason codes.
/// </summary>
public static class EmergencyOverrideReasonCodes
{
    public const string AcuteChestPain = "EMERG-01";
    public const string SevereRespiratoryDistress = "EMERG-02";
    public const string Anaphylaxis = "EMERG-03";
    public const string AcuteNeurologicalDeficit = "EMERG-04";
    public const string SevereTraumaOrHemorrhage = "EMERG-05";
    public const string ObstetricEmergency = "EMERG-06";
    public const string AcutePsychiatricEmergency = "EMERG-07";
    public const string AcuteStrokeOrNeurological = "EMERG-09";
    public const string ClinicianDiscretionOther = "EMERG-99";

    public static readonly IReadOnlyDictionary<string, string> Descriptions = new Dictionary<string, string>
    {
        [AcuteChestPain] = "Acute chest pain or suspected acute coronary syndrome",
        [SevereRespiratoryDistress] = "Severe respiratory distress, stridor, or cyanosis",
        [Anaphylaxis] = "Suspected anaphylaxis or acute allergic angioedema",
        [AcuteNeurologicalDeficit] = "Sudden onset focal neurological deficit, stroke signs, or active seizure",
        [SevereTraumaOrHemorrhage] = "Active hemorrhage or severe traumatic injury",
        [ObstetricEmergency] = "Acute obstetric emergency, active labor, or severe abdominal pain in pregnancy",
        [AcutePsychiatricEmergency] = "Acute psychiatric crisis with imminent risk of self-harm or harm to others",
        [AcuteStrokeOrNeurological] = "Acute neurological deficit or suspected stroke emergency triage",
        [ClinicianDiscretionOther] = "Clinician emergency clinical judgment (narrative mandatory)"
    };

    public static bool IsValidCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return false;
        var trimmed = code.Trim().ToUpperInvariant();
        return Descriptions.ContainsKey(trimmed) || System.Text.RegularExpressions.Regex.IsMatch(trimmed, @"^EMERG-\d{2}$");
    }
}
