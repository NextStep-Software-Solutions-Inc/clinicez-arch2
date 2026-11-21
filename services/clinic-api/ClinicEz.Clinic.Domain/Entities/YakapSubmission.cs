using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class YakapSubmission : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid? PatientYakapEnlistmentId { get; set; }
    public PatientYakapEnlistment? PatientYakapEnlistment { get; set; }

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public Guid? SourceRecordId { get; set; }

    public string AccreditationNo { get; set; } = string.Empty;
    public string CaseNo { get; set; } = string.Empty;

    public YakapSubmissionType SubmissionType { get; set; }
    public YakapReportStatus ReportStatus { get; set; } = YakapReportStatus.U;

    public string LocalTransactionNo { get; set; } = string.Empty; // 23B E/P/S/D/L/M/R/K
    public string? UploadTransactionNo { get; set; }                // 23B PhilHealth U...
    public string? YesReferenceNo { get; set; }                     // 10B PhilHealth MCA...

    public YakapProcessingStatus ProcessingStatus { get; set; } = YakapProcessingStatus.Queued;

    public string? PayloadSha256Hash { get; set; }
    public DateTime? SubmittedAtUtc { get; set; }
    public DateTime? LastPolledAtUtc { get; set; }
    public DateTime? NextPollAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public int AttemptCount { get; set; } = 0;
    public string? LastErrorMessage { get; set; }

    public ICollection<YakapSubmissionError> Errors { get; set; } = new List<YakapSubmissionError>();
}
