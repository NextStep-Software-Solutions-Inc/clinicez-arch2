using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum PhilHealthSequenceType
{
    Case = 0,              // 'C' - Patient Annual Case Number
    Profiling = 1,         // 'P' - FPE / Profiling Transaction Number (Annex A)
    Consultation = 2,      // 'S' - Consultation / SOAP Transaction Number (Annex B)
    Soap = Consultation,   // Alias for Consultation
    DiagnosticRequest = 3, // 'D' - Diagnostic Request
    DiagnosticResults = 4, // 'L' - Diagnostic Results
    Medicine = 5,          // 'M' - Medicine Dispensation
    Referral = 6           // 'R' - Referral / Transfer
}

public sealed class PhilHealthDailySequence : ClinicScopedEntity
{
    public string AccreditationNo { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    public DateOnly ManilaDate { get; set; }
    public long LastValue { get; set; }
}
