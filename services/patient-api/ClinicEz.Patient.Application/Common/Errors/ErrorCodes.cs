namespace ClinicEz.Patient.Application.Common.Errors;

/// <summary>
/// Standardized, machine-readable error codes returned in validation failures
/// and business rule exceptions. Codes follow SCREAMING_SNAKE_CASE and are
/// grouped by domain. Clients can branch on these codes without parsing messages.
/// </summary>
public static class ErrorCodes
{
    // ── Validation ────────────────────────────────────────────────────────────
    public const string RequiredFieldMissing    = "REQUIRED_FIELD_MISSING";
    public const string FieldTooLong            = "FIELD_TOO_LONG";
    public const string FieldTooShort           = "FIELD_TOO_SHORT";
    public const string InvalidFieldFormat      = "INVALID_FIELD_FORMAT";
    public const string InvalidEnumValue        = "INVALID_ENUM_VALUE";
    public const string InvalidDateRange        = "INVALID_DATE_RANGE";
    public const string CollectionEmpty         = "COLLECTION_EMPTY";
    public const string CollectionTooLarge      = "COLLECTION_TOO_LARGE";
    public const string FutureDateNotAllowed    = "FUTURE_DATE_NOT_ALLOWED";
    public const string DuplicateItem           = "DUPLICATE_ITEM";

    // ── Patient ───────────────────────────────────────────────────────────────
    public const string PatientNotFound         = "PATIENT_NOT_FOUND";
    public const string PatientAlreadyExists    = "PATIENT_ALREADY_EXISTS";

    // ── Sync ─────────────────────────────────────────────────────────────────
    public const string SyncPayloadInvalid      = "SYNC_PAYLOAD_INVALID";
    public const string SyncEntityTypeUnknown   = "SYNC_ENTITY_TYPE_UNKNOWN";
    public const string SyncConflictResolved    = "SYNC_CONFLICT_RESOLVED";
    public const string SyncItemRejected        = "SYNC_ITEM_REJECTED";

    // ── Device Session / Auth ─────────────────────────────────────────────────
    public const string SessionNotFound         = "SESSION_NOT_FOUND";
    public const string SessionExpired          = "SESSION_EXPIRED";
    public const string SessionDeviceMismatch   = "SESSION_DEVICE_MISMATCH";
    public const string SessionRevoked          = "SESSION_REVOKED";
    public const string DuplicateDeviceSession  = "DUPLICATE_DEVICE_SESSION";

    // ── Files / Storage ──────────────────────────────────────────────────────
    public const string FileSizeExceeded        = "FILE_SIZE_EXCEEDED";
    public const string FileTypeNotAllowed      = "FILE_TYPE_NOT_ALLOWED";

    // ── General ───────────────────────────────────────────────────────────────
    public const string ResourceNotFound        = "RESOURCE_NOT_FOUND";
    public const string ConcurrencyConflict     = "CONCURRENCY_CONFLICT";
    public const string ExternalServiceUnavailable = "EXTERNAL_SERVICE_UNAVAILABLE";
}
