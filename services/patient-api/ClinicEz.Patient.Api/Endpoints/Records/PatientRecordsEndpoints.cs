using System;
using System.Collections.Generic;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Api.Endpoints.Documents;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Records.Commands;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Patient.Application.Features.Records.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Records;

internal static class PatientRecordDocumentTypeResolver
{
    private static readonly Guid XrayId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid LabResultId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid MedicalCertificateId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid PrescriptionId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    private static readonly Guid GovernmentId = Guid.Parse("55555555-5555-5555-5555-555555555555");
    private static readonly Guid OtherId = Guid.Parse("66666666-6666-6666-6666-666666666666");

    public static bool TryResolve(string? rawValue, out Guid documentTypeId, out string? documentTypeCode)
    {
        documentTypeId = Guid.Empty;
        documentTypeCode = null;

        if (string.IsNullOrWhiteSpace(rawValue))
            return false;

        var trimmed = rawValue.Trim();
        if (Guid.TryParse(trimmed, out var parsed) && parsed != Guid.Empty)
        {
            documentTypeId = parsed;
            return true;
        }

        var normalized = trimmed.ToLowerInvariant().Replace('_', '-').Replace(' ', '-');
        switch (normalized)
        {
            case "imaging":
            case "xray":
            case "x-ray":
            case "file-type-xray":
                documentTypeId = XrayId;
                documentTypeCode = "xray";
                return true;
            case "lab-result":
            case "lab-results":
            case "file-type-lab-result":
                documentTypeId = LabResultId;
                documentTypeCode = "lab-result";
                return true;
            case "certificate":
            case "certificates":
            case "medical-certificate":
            case "file-type-medical-certificate":
                documentTypeId = MedicalCertificateId;
                documentTypeCode = "medical-certificate";
                return true;
            case "prescription":
            case "prescriptions":
            case "file-type-prescription":
                documentTypeId = PrescriptionId;
                documentTypeCode = "prescription";
                return true;
            case "id":
            case "government-id":
            case "file-type-id":
                documentTypeId = GovernmentId;
                documentTypeCode = "id";
                return true;
            case "vaccine-card":
            case "other":
            case "file-type-other":
                documentTypeId = OtherId;
                documentTypeCode = "other";
                return true;
            default:
                return false;
        }
    }
}

public sealed class UploadPatientRecordEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/records", async (
                Guid patientId,
                IFormFile? file,
                [FromForm] string? documentTypeId,
                [FromForm] string? title,
                [FromForm] string? documentDate,
                [FromForm] string? facilityName,
                [FromForm] string? notes,
                [FromForm] string? clientFileId,
                ISender sender,
                CancellationToken ct) =>
            {
                if (UploadedFileGuard.Reject(file, "file", required: true) is { } rejection)
                    return rejection;

                if (!PatientRecordDocumentTypeResolver.TryResolve(documentTypeId, out var resolvedDocTypeId, out var resolvedDocTypeCode))
                {
                    const string msg = "A valid document type is required.";
                    return Results.Json(
                        ApiResponse<object>.Fail(msg, [new ApiFieldError("documentTypeId", ErrorCodes.InvalidFieldFormat, msg)]),
                        statusCode: StatusCodes.Status400BadRequest);
                }

                DateOnly? docDate = null;
                if (!string.IsNullOrWhiteSpace(documentDate) && DateOnly.TryParse(documentDate, out var parsed))
                {
                    docDate = parsed;
                }

                Guid? parsedClientFileId = null;
                if (!string.IsNullOrWhiteSpace(clientFileId) && Guid.TryParse(clientFileId, out var cid) && cid != Guid.Empty)
                {
                    parsedClientFileId = cid;
                }

                await using var stream = file!.OpenReadStream();
                var dto = await sender.Send(new UploadPatientRecordCommand(
                    PatientId: patientId,
                    Content: stream,
                    FileName: file.FileName,
                    ContentType: file.ContentType,
                    SizeBytes: file.Length,
                    DocumentTypeId: resolvedDocTypeId,
                    Title: title ?? string.Empty,
                    DocumentDate: docDate,
                    FacilityName: facilityName,
                    Notes: notes,
                    ClientFileId: parsedClientFileId,
                    DocumentTypeCode: resolvedDocTypeCode
                ), ct);

                return Results.Created($"/api/v1/patients/{patientId}/records/{dto.Id}", ApiResponse<FileRecordDto>.Success(dto));
            })
            .DisableAntiforgery()
            .WithTags("Records")
            .WithName("UploadPatientRecord")
            .WithSummary("Upload and envelope-encrypt a health record for the patient")
            .WithDescription("Multipart upload (file up to 25 MB: PDF, JPEG, PNG, HEIC, WEBP). Encrypted with server-side PMK AES-256-GCM.")
            .Accepts<IFormFile>("multipart/form-data")
            .Produces<ApiResponse<FileRecordDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status413PayloadTooLarge)
            .Produces<ApiResponse<object>>(StatusCodes.Status415UnsupportedMediaType)
            .RequireAuthorization();
    }
}

public sealed class GetPatientRecordsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/records", async (
                Guid patientId,
                [FromQuery] string? documentTypeId,
                [FromQuery] string? searchTerm,
                [FromQuery] string? from,
                [FromQuery] string? to,
                ISender sender,
                CancellationToken ct) =>
            {
                Guid? resolvedDocTypeId = null;
                if (!string.IsNullOrWhiteSpace(documentTypeId))
                {
                    if (!PatientRecordDocumentTypeResolver.TryResolve(documentTypeId, out var parsedDocTypeId, out _))
                    {
                        const string msg = "Invalid documentTypeId filter.";
                        return Results.Json(
                            ApiResponse<object>.Fail(msg, [new ApiFieldError("documentTypeId", ErrorCodes.InvalidFieldFormat, msg)]),
                            statusCode: StatusCodes.Status400BadRequest);
                    }
                    resolvedDocTypeId = parsedDocTypeId;
                }

                DateOnly? fromDate = DateOnly.TryParse(from, out var f) ? f : null;
                DateOnly? toDate = DateOnly.TryParse(to, out var t) ? t : null;

                var records = await sender.Send(new GetPatientRecordsQuery(patientId, resolvedDocTypeId, searchTerm, fromDate, toDate), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<FileRecordDto>>.Success(records));
            })
            .WithTags("Records")
            .WithName("GetPatientRecords")
            .WithSummary("List all active health records for the patient")
            .WithDescription("Returns metadata for all non-deleted patient records, sorted by document date descending.")
            .Produces<ApiResponse<IReadOnlyList<FileRecordDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .RequireAuthorization();
    }
}

public sealed class StreamPatientRecordEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/records/{fileId:guid}/stream", async (
                Guid patientId,
                Guid fileId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new StreamPatientRecordQuery(patientId, fileId), ct);
                return Results.File(
                    fileStream: result.Stream,
                    contentType: result.ContentType,
                    fileDownloadName: result.FileName,
                    enableRangeProcessing: true);
            })
            .WithTags("Records")
            .WithName("StreamPatientRecord")
            .WithSummary("Stream decrypted patient record")
            .WithDescription("Decrypts the .cez ciphertext using the patient's PMK and streams plaintext bytes with range processing enabled.")
            .Produces(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class StreamLabResultReportEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/documents/lab-results/{reportId:guid}/stream", async (
                Guid patientId,
                Guid reportId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new StreamLabResultReportQuery(patientId, reportId), ct);
                return Results.File(
                    fileStream: result.Stream,
                    contentType: result.ContentType,
                    fileDownloadName: result.FileName,
                    enableRangeProcessing: true);
            })
            .WithTags("Documents")
            .WithName("StreamLabResultReport")
            .WithSummary("Stream decrypted lab result PDF report")
            .WithDescription("Decrypts the clinic or patient lab result report PDF and streams plaintext bytes with range processing enabled.")
            .Produces(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class DeletePatientRecordEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/records/{fileId:guid}", async (
                Guid patientId,
                Guid fileId,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new DeletePatientRecordCommand(patientId, fileId), ct);
                return Results.NoContent();
            })
            .WithTags("Records")
            .WithName("DeletePatientRecord")
            .WithSummary("Soft delete a patient health record and remove .cez from storage")
            .WithDescription("Soft-deletes the record in patient-api and deletes the patient's ciphertext file from R2. Clinic copies remain intact.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .RequireAuthorization();
    }
}
