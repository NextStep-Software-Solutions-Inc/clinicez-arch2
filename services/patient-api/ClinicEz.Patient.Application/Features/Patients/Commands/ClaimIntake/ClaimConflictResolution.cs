using System;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

public enum ClaimConflictOutcome
{
    NewSelf,
    ExistingSelf,
    ManagedDependentProxy,
    MedicalPrivacyBlocked
}

public sealed record ClaimConflictResult(
    ClaimConflictOutcome Outcome,
    string RelationshipType, // "Self" or "Dependent"
    string Reason);
