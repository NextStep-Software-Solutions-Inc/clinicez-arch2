using System;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.LabOrders;

/// <summary>Body of a <see cref="PatientDocumentKind.LabResult"/> document for a result that has no structured report (uploads).</summary>
public sealed record LabResultDocumentBody(
    Guid RequisitionId,
    string OrderNumber,
    ResultSource Source,
    VerificationState Verification,
    string? ExternalLabName,
    string? FileName,
    string? ContentType,
    DateTime SubmittedAtUtc,
    string? ReviewedByName,
    DateTime? ReviewedAtUtc,
    string? ReviewRemarks);

public static class LabResultDocuments
{
    /// <summary>
    /// The patient's copy of one result. The result id is the document id, so the copy is updated in place as the result is
    /// reviewed. <paramref name="body"/> replaces the default upload summary (the ClinicEZ lab's structured report).
    /// </summary>
    public static PatientDocumentDraft For(ClinicLabOrder order, ClinicLabResult result, object? body = null) => new(
        order.ClinicId,
        order.PatientId,
        result.Id,
        PatientDocumentKind.LabResult,
        $"Laboratory result {order.OrderNumber}",
        result.SubmittedAt,
        Status: result.Verification.ToString(),
        Source: result.Source,
        Verification: result.Verification,
        Body: body ?? new LabResultDocumentBody(
            order.Id,
            order.OrderNumber,
            result.Source,
            result.Verification,
            result.ExternalLabName,
            result.FileName,
            result.ContentType,
            result.SubmittedAt,
            result.VerifiedByName,
            result.VerifiedAt,
            result.ReviewRemarks));
}
