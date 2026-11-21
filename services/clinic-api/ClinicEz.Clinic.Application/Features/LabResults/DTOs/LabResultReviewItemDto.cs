using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.LabResults.DTOs;

public record LabResultReviewItemDto(
    Guid Id,
    Guid LabOrderId,
    string OrderNumber,
    Guid PatientId,
    string PatientName,
    string? OrderedByDoctorName,
    List<string> TestNames,
    ResultSource Source,
    VerificationState VerificationState,
    string? ExternalLabName,
    string? FileName,
    string? ContentType,
    long? FileSizeBytes,
    DateTime SubmittedAtUtc,
    string? VerifiedByName,
    DateTime? VerifiedAtUtc,
    string? Remarks,
    bool HasPanicAlert
)
{
    public static LabResultReviewItemDto From(LabResult result, LabOrder order) => new(
        result.Id,
        order.Id,
        order.OrderNumber,
        order.PatientId,
        order.PatientName,
        order.OrderedByDoctorName,
        order.Items.Select(i => i.TestName).ToList(),
        result.Source,
        result.Verification,
        result.ExternalLabName,
        result.FileName,
        result.ContentType,
        string.IsNullOrEmpty(result.StorageKey) ? null : result.FileSizeBytes,
        result.SubmittedAt,
        result.VerifiedByName,
        result.VerifiedAt,
        result.ReviewRemarks,
        order.HasCriticalPanicAlert);
}

public record ReviewLabResultRequest(bool Accepted, string? Remarks);

public record LabResultFileDto(byte[] Content, string ContentType, string FileName);
