using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Documents.Commands.MarkPrescriptionExternallyDispensed;
using ClinicEz.Patient.Application.Features.Documents.Commands.UploadLabResult;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Patient.Api.Endpoints.Documents;

/// <summary>Rejects an uploaded file with the matching HTTP status before any of it is read into the application.</summary>
internal static class UploadedFileGuard
{
    public static IResult? Reject(IFormFile? file, string field, bool required)
    {
        if (file is null)
            return required ? Problem(StatusCodes.Status400BadRequest, field, ErrorCodes.RequiredFieldMissing, "A file is required.") : null;

        if (file.Length == 0)
            return Problem(StatusCodes.Status400BadRequest, field, ErrorCodes.RequiredFieldMissing, "The file is empty.");

        if (file.Length > PatientFileLimits.MaxFileBytes)
            return Problem(
                StatusCodes.Status413PayloadTooLarge, field, ErrorCodes.FileSizeExceeded,
                $"The file must be at most {PatientFileLimits.MaxFileBytes / (1024 * 1024)} MB.");

        if (!PatientFileLimits.IsPdfOrImage(file.ContentType))
            return Problem(
                StatusCodes.Status415UnsupportedMediaType, field, ErrorCodes.FileTypeNotAllowed,
                "Only PDF, JPEG, PNG and HEIC files are accepted.");

        return null;
    }

    private static IResult Problem(int status, string field, string code, string message) =>
        Results.Json(ApiResponse<object>.Fail(message, [new ApiFieldError(field, code, message)]), statusCode: status);
}

public sealed class UploadLabResultEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/lab-requests/{requisitionId:guid}/results", async (
                Guid patientId, Guid requisitionId, IFormFile? file, [FromForm] string? notes,
                ISender sender, CancellationToken ct) =>
            {
                if (UploadedFileGuard.Reject(file, "file", required: true) is { } rejection)
                    return rejection;

                await using var content = file!.OpenReadStream();
                var accepted = await sender.Send(
                    new UploadLabResultCommand(patientId, requisitionId, content, file.FileName, file.ContentType, file.Length, notes), ct);

                return Results.Json(ApiResponse<LabResultUploadAcceptedDto>.Success(accepted), statusCode: StatusCodes.Status202Accepted);
            })
            .DisableAntiforgery()
            .WithTags("Documents")
            .WithName("UploadLabResult")
            .WithSummary("Attach a result file to one of the patient's lab requests")
            .WithDescription("Multipart upload (file up to 10 MB: PDF, JPEG, PNG or HEIC). The file stays unverified until the ordering doctor reviews it.")
            .Accepts<IFormFile>("multipart/form-data")
            .Produces<ApiResponse<LabResultUploadAcceptedDto>>(StatusCodes.Status202Accepted)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status413PayloadTooLarge)
            .Produces<ApiResponse<object>>(StatusCodes.Status415UnsupportedMediaType)
            .RequireAuthorization();
    }
}

public sealed class MarkPrescriptionExternallyDispensedEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/prescriptions/{prescriptionId:guid}/external-dispense", async (
                Guid patientId, Guid prescriptionId,
                [FromForm] string? pharmacyName, [FromForm] string? branchLocation, [FromForm] string? pharmacistName,
                [FromForm] string? receiptNumber, [FromForm] string? notes, IFormFile? receipt,
                ISender sender, CancellationToken ct) =>
            {
                if (UploadedFileGuard.Reject(receipt, "receipt", required: false) is { } rejection)
                    return rejection;

                await using var content = receipt?.OpenReadStream();
                var receiptFile = receipt is null ? null : new ReceiptFile(content!, receipt.FileName, receipt.ContentType, receipt.Length);

                var accepted = await sender.Send(new MarkPrescriptionExternallyDispensedCommand(
                    patientId, prescriptionId, pharmacyName ?? string.Empty, branchLocation, pharmacistName, receiptNumber, notes, receiptFile), ct);

                return Results.Json(ApiResponse<ExternalDispenseAcceptedDto>.Success(accepted), statusCode: StatusCodes.Status202Accepted);
            })
            .DisableAntiforgery()
            .WithTags("Documents")
            .WithName("MarkPrescriptionExternallyDispensed")
            .WithSummary("Report that a prescription was filled at a pharmacy outside Clinic EZ")
            .WithDescription("Multipart form: pharmacyName (required), branchLocation, pharmacistName, receiptNumber, notes and an optional receipt file (up to 10 MB). The issuing clinic is informed.")
            .Accepts<IFormFile>("multipart/form-data")
            .Produces<ApiResponse<ExternalDispenseAcceptedDto>>(StatusCodes.Status202Accepted)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .Produces<ApiResponse<object>>(StatusCodes.Status413PayloadTooLarge)
            .Produces<ApiResponse<object>>(StatusCodes.Status415UnsupportedMediaType)
            .RequireAuthorization();
    }
}
