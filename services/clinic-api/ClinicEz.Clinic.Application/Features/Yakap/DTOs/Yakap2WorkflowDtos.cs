using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public sealed record YakapStandingCheckDto(
    string Pin,
    int EffectiveYear,
    string? PatientLastName,
    string? PatientFirstName,
    string PcuStatus,
    string? PcuTransactionCode,
    string SelectionStatus,
    string? SelectionTransactionNo,
    string? SelectionDate,
    string EmpanelmentStatus,
    string? YesReferenceNo,
    string FpeStatus,
    string? FpeTransactionNo,
    string? FpeUploadTransactionNo,
    string ConsultationStatus,
    Guid? LocalEnlistmentId,
    bool NeedsClinicSelection,
    bool NeedsIdentityCheck,
    bool CanStartCheckup,
    string SummaryMessage
);

public sealed record YakapPcuStartResultDto(
    Guid VerificationId,
    string SdkUrl,
    string LivenessAuthorizationId,
    string Status,
    int ExpiresInSeconds
);

public sealed record YakapIdentityVerificationDto(
    Guid VerificationId,
    Guid PatientId,
    string Mode,
    DateOnly VerificationDate,
    bool IsVerified,
    string? TransactionCode,
    string? Status,
    string? ValidIdTypeCode,
    DateTime? VerifiedAtUtc
);

public sealed record YakapSelectionResultDto(
    Guid EnlistmentId,
    Guid PatientId,
    int EffectiveYear,
    string SelectionStatus,
    string? SelectionTransactionNo,
    DateOnly SelectionDate,
    string? CaseNo,
    bool QueuedForSync,
    string Message
);

public sealed record YakapFpeSubmissionResultDto(
    Guid SubmissionId,
    Guid ScreeningId,
    string ProcessingStatus,
    string LocalTransactionNo,
    string? UploadTransactionNo,
    string? YesReferenceNo,
    string? EmpanelmentStatus,
    string? ErrorMessage
);

public sealed record ClinicYakapSubmissionErrorDto(
    string FieldPath,
    string Issue,
    string? ErrorCode
);

public sealed record ClinicYakapSubmissionDto(
    Guid Id,
    Guid PatientId,
    string PatientCode,
    string AccreditationNo,
    string CaseNo,
    string SubmissionType,
    string LocalTransactionNo,
    string? UploadTransactionNo,
    string? YesReferenceNo,
    string ProcessingStatus,
    string? PayloadSha256Hash,
    DateTime? SubmittedAtUtc,
    DateTime? LastPolledAtUtc,
    DateTime? CompletedAtUtc,
    int AttemptCount,
    string? LastErrorMessage,
    IReadOnlyList<ClinicYakapSubmissionErrorDto> Errors
);

public sealed record PinVerificationResultDto(
    bool IsValid,
    string FormattedPin,
    bool IsSequenceValid,
    bool IsPhilHealthVerified,
    string? MemberName = null,
    string? FailureReason = null,
    bool IsServerError = false,
    bool IsUniqueInClinic = true,
    string? ConflictingPatientName = null,
    string? ConflictingPatientCode = null
);
