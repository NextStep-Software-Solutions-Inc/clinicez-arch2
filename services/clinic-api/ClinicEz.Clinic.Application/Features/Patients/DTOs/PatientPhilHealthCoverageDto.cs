using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record CurrentYearFpeStatusDto(
    int EffectiveYear,
    bool HasActiveEnlistment,
    Guid? EnlistmentId,
    bool IsCompleted,
    DateOnly? ProfilingDate = null,
    string? ProfilingTransNo = null,
    string? ProfilingAtc = null,
    string? SelectionControlNumber = null,
    string? YesReferenceNo = null,
    string? RegistrationStatusCode = null
);

public sealed record PatientIdentityVerificationSummaryDto(
    Guid Id,
    string Mode,
    DateOnly VerificationDate,
    bool IsVerifiedForToday,
    string? PcuTransactionId = null,
    string? PcuStatus = null,
    string? OtpStatus = null,
    string? ValidIdTypeCode = null,
    DateTime? VerifiedAtUtc = null
);

public sealed record PatientYakapSubmissionSummaryDto(
    Guid Id,
    string SubmissionType,
    string LocalTransactionNo,
    string? UploadTransactionNo,
    string? YesReferenceNo,
    string ProcessingStatus,
    DateTime? SubmittedAtUtc = null,
    DateTime? CompletedAtUtc = null,
    string? LastErrorMessage = null
);

public sealed record PatientPhilHealthCoverageDto(
    Guid PatientId,
    string? PhilHealthNumber,
    PatientPhilHealthMembershipDto? Membership,
    List<PatientYakapEnlistmentDto> Enlistments,
    CurrentYearFpeStatusDto CurrentYearFpeStatus,
    PatientIdentityVerificationSummaryDto? LatestIdentityVerification = null,
    PatientYakapSubmissionSummaryDto? LatestFpeSubmission = null
);
