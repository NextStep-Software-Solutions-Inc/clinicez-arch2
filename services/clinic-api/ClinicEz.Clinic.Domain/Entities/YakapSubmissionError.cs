using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class YakapSubmissionError : ClinicScopedEntity
{
    public Guid YakapSubmissionId { get; set; }
    public YakapSubmission YakapSubmission { get; set; } = null!;

    public string FieldPath { get; set; } = string.Empty;
    public string Issue { get; set; } = string.Empty;
    public string? ErrorCode { get; set; }
}
