namespace ClinicEz.Patient.Domain.Enums;

/// <summary>Lifecycle of a lab request slip, mirrored from the laboratory/clinic that owns the order.</summary>
public enum LabSlipStage
{
    Issued, Routed, Claimed, AwaitingPayment, Paid, SpecimenCollected,
    InProcess, ResultFinalized, ExternalSubmitted, Reviewed, Rejected, Cancelled
}

/// <summary>Lifecycle of a prescription, mirrored from the pharmacy that fills it.</summary>
public enum PrescriptionStage { Issued, Accepted, PartiallyAccepted, Rejected, Dispensed, ExternalDispensed }

/// <summary>Where a lab result came from. Derived from the delivery channel, never supplied by a caller.</summary>
public enum ResultProvenance { ClinicEzLab, ExternalLab, PatientUploaded }

/// <summary>ClinicEZ-lab results arrive Verified; external and patient uploads stay Unverified until the ordering doctor reviews.</summary>
public enum ResultVerification { Verified, Unverified, Rejected }

/// <summary>How a facility came to hold a grant on the patient's data.</summary>
public enum AccessGrantSource { Qr, Booking, Manual }