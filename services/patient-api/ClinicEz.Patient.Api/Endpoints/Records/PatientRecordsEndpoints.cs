using System;
using System.Collections.Generic;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Api.Endpoints.Documents;
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

public sealed class UploadPatientRecordEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/records", async (
                Guid patientId,
                IFormFile? file,
                [FromForm] Guid documentTypeId,
                [FromForm] string title,
                [FromForm] string? documentDate,
                [FromForm] string? facilityName,
                [FromForm] string? notes,
                [FromForm] Guid? clientFileId,
                ISender sender,
                CancellationToken ct) =>
            {
                if (UploadedFileGuard.Reject(file, "file", required: true) is { } rejection)
                    return rejection;

                DateOnly? docDate = null;
                if (!string.IsNullOrWhiteSpace(documentDate) && DateOnly.TryParse(documentDate, out var parsed))
                {
                    docDate = parsed;
                }

                await using var stream = file!.OpenReadStream();
                var dto = await sender.Send(new UploadPatientRecordCommand(
                    PatientId: patientId,
                    Content: stream,
                    FileName: file.FileName,
                    ContentType: file.ContentType,
                    SizeBytes: file.Length,
                    DocumentTypeId: documentTypeId,
                    Title: title ?? string.Empty,
                    DocumentDate: docDate,
                    FacilityName: facilityName,
                    Notes: notes,
                    ClientFileId: clientFileId
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
                [FromQuery] Guid? documentTypeId,
                [FromQuery] string? searchTerm,
                [FromQuery] string? from,
                [FromQuery] string? to,
                ISender sender,
                CancellationToken ct) =>
            {
                DateOnly? fromDate = DateOnly.TryParse(from, out var f) ? f : null;
                DateOnly? toDate = DateOnly.TryParse(to, out var t) ? t : null;

                var records = await sender.Send(new GetPatientRecordsQuery(patientId, documentTypeId, searchTerm, fromDate, toDate), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<FileRecordDto>>.Success(records));
            })
            .WithTags("Records")
            .WithName("GetPatientRecords")
            .WithSummary("List all active health records for the patient")
            .WithDescription("Returns metadata for all non-deleted patient records, sorted by document date descending.")
            .Produces<ApiResponse<IReadOnlyList<FileRecordDto>>>(StatusCodes.Status200OK)
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
