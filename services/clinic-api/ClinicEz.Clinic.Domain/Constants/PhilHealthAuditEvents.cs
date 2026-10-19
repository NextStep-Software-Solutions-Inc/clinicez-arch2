namespace ClinicEz.Clinic.Domain.Constants;

/// <summary>
/// Machine action keys for PhilHealth Yakap statutory audit events (RA 11223, Circular 2023-0004).
/// </summary>
public static class PhilHealthAuditEvents
{
    public const string PinVerified = "yakap.pin.verified";
    public const string MasterlistSynced = "yakap.masterlist.synced";
    public const string EkasCreated = "yakap.ekas.created";
    public const string AtcGenerated = "yakap.atc.generated";
    public const string GamotDispensed = "yakap.gamot.dispensed";
    public const string TransmittalGenerated = "yakap.transmittal.generated";
    public const string TransmittalEncrypted = "yakap.transmittal.encrypted";
    public const string SoapSubmitted = "yakap.soap.submitted";
    public const string ClaimRejected = "yakap.claim.rejected";
    public const string ClaimVoided = "yakap.claim.voided";
}
