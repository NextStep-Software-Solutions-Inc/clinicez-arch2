namespace ClinicEz.Clinic.Domain.Constants;

/// <summary>
/// Machine action keys for PhilHealth YAKAP 2.0 (PCAPI v2.0) statutory audit events.
/// </summary>
public static class PhilHealthAuditEvents
{
    public const string PinVerified = "yakap.pin.verified";
    public const string StandingValidated = "yakap.standing.validated";
    public const string PcuVerified = "yakap.pcu.verified";
    public const string OtpValidated = "yakap.otp.validated";
    public const string ValidIdRecorded = "yakap.valid_id.recorded";
    public const string SelectionSubmitted = "yakap.selection.submitted";
    public const string MasterlistSynced = "yakap.masterlist.synced";
    public const string EkasCreated = "yakap.ekas.created";
    public const string AtcGenerated = "yakap.atc.generated";
    public const string GamotDispensed = "yakap.gamot.dispensed";
    public const string FpeUploaded = "yakap.fpe.uploaded";
    public const string ConsultationUploaded = "yakap.consultation.uploaded";
    public const string EmpanelmentSubmitted = "yakap.empanelment.submitted";
    public const string SubmissionStatusPolled = "yakap.submission.polled";
    public const string AvailmentSlipGenerated = "yakap.availment_slip.generated";
    public const string ClaimRejected = "yakap.claim.rejected";
    public const string ClaimVoided = "yakap.claim.voided";
}
