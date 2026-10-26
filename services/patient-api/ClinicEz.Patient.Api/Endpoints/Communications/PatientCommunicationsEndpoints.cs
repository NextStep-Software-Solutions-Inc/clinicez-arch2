using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Application.Features.Communications.Queries;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Communications;

public sealed class PatientCommunicationsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patient")
            .WithTags("Communications")
            .RequireAuthorization();

        // 1. GET /api/v1/patient/conversations
        group.MapGet("/conversations", async (
                [FromQuery] Guid? dependentId,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new GetPatientConversationsQuery(userId, dependentId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<PatientConversationDto>>.Success(result));
            })
            .WithName("GetPatientConversations")
            .WithSummary("Get multi-tenant unified inbox for patient and managed dependents")
            .Produces<ApiResponse<IReadOnlyList<PatientConversationDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden);

        // 2. GET /api/v1/patient/conversations/{id:guid}
        group.MapGet("/conversations/{id:guid}", async (
                Guid id,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new GetPatientConversationDetailQuery(id, userId), ct);
                return Results.Ok(ApiResponse<PatientConversationDetailDto>.Success(result));
            })
            .WithName("GetPatientConversationDetail")
            .WithSummary("Get conversation thread with public messages and attachments")
            .Produces<ApiResponse<PatientConversationDetailDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        // 3. POST /api/v1/patient/conversations/{id:guid}/messages
        group.MapPost("/conversations/{id:guid}/messages", async (
                Guid id,
                SubmitMessageRequest request,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new SubmitPatientMessageCommand(
                    id,
                    userId,
                    request.ContentText,
                    request.ClientMessageId,
                    request.Attachments), ct);

                return Results.Created($"/api/v1/patient/conversations/{id}/messages/{result.Id}",
                    ApiResponse<PatientMessageDto>.Success(result));
            })
            .WithName("SubmitPatientMessage")
            .WithSummary("Submit a message in an existing routed conversation thread")
            .Produces<ApiResponse<PatientMessageDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        // 4. POST /api/v1/patient/requests
        group.MapPost("/requests", async (
                SubmitPatientInquiryRequest request,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new SubmitPatientInquiryCommand(
                    userId,
                    request.PatientId,
                    request.TenantId,
                    request.FacilityId,
                    request.FacilityType,
                    request.FacilityName,
                    request.Category,
                    request.ContentText,
                    request.IsEmergencyConfirmed,
                    request.Attachments), ct);

                return Results.Ok(ApiResponse<SubmitPatientInquiryResponse>.Success(result));
            })
            .WithName("SubmitPatientRequest")
            .WithSummary("Submit an initial patient inquiry to a facility with emergency gate & eligibility check")
            .Produces<ApiResponse<SubmitPatientInquiryResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden);

        // 5. POST /api/v1/patient/conversations/{id:guid}/messages/{messageId:guid}/resend
        group.MapPost("/conversations/{id:guid}/messages/{messageId:guid}/resend", async (
                Guid id,
                Guid messageId,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new ResendPatientMessageCommand(id, messageId, userId), ct);
                return Results.Ok(ApiResponse<PatientMessageDto>.Success(result));
            })
            .WithName("ResendPatientMessage")
            .WithSummary("One-tap idempotent resend for unreceived messages using original ClientMessageId")
            .Produces<ApiResponse<PatientMessageDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        // 6. POST /api/v1/patient/conversations/{id:guid}/messages/{messageId:guid}/acknowledge
        group.MapPost("/conversations/{id:guid}/messages/{messageId:guid}/acknowledge", async (
                Guid id,
                Guid messageId,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var success = await sender.Send(new AcknowledgePatientMessageCommand(id, messageId, userId), ct);
                return Results.Ok(ApiResponse<bool>.Success(success, "Message acknowledged."));
            })
            .WithName("AcknowledgePatientMessage")
            .WithSummary("Single-tap 'Understood' acknowledgment for clinician instructions")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        // 7. DELETE /api/v1/patient/conversations/{id:guid}/copy
        group.MapDelete("/conversations/{id:guid}/copy", async (
                Guid id,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var success = await sender.Send(new HidePatientConversationCopyCommand(id, userId), ct);
                return Results.Ok(ApiResponse<bool>.Success(success, "Conversation copy hidden."));
            })
            .WithName("HidePatientConversationCopy")
            .WithSummary("'Hide My Copy' privacy toggle - zero mutation to facility master record")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        // 8. POST /api/v1/patient/communications/attachments
        group.MapPost("/communications/attachments", async (
                IFormFile? file,
                ICurrentUserService currentUser,
                IPatientRepository patientRepo,
                IImageConversionService imageService,
                IPatientEncryptionService encryptionService,
                IStorageService storageService,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var patient = await patientRepo.GetByClerkUserIdWithDetailsAsync(userId, ct);
                if (patient == null)
                    throw new UnauthorizedException("Patient profile not found.");

                if (file is null || file.Length == 0)
                {
                    return Results.BadRequest(ApiResponse<object>.Fail("File is required.",
                        [new ApiFieldError("file", "REQUIRED_FIELD_MISSING", "A file is required.")]));
                }

                if (file.Length > 15 * 1024 * 1024)
                {
                    return Results.Json(ApiResponse<object>.Fail("File size exceeds 15 MB limit.",
                        [new ApiFieldError("file", "FILE_SIZE_EXCEEDED", "File size exceeds 15 MB limit.")]),
                        statusCode: StatusCodes.Status413PayloadTooLarge);
                }

                await using var stream = file.OpenReadStream();
                var scanResult = await imageService.ProcessAndSanitizeImageAsync(
                    stream, file.FileName, file.ContentType, ct);

                if (!scanResult.IsClean)
                {
                    return Results.BadRequest(ApiResponse<object>.Fail(
                        scanResult.ErrorReason ?? "File failed security scan.",
                        [new ApiFieldError("file", "SECURITY_SCAN_FAILED", scanResult.ErrorReason ?? "File rejected.")]));
                }

                var storageKey = $"comms/attachments/{patient.Id}/{Guid.NewGuid():N}/{scanResult.FileName}";
                var encrypted = await encryptionService.EncryptAsync(scanResult.Data, patient.Id, ct);
                await storageService.SaveEncryptedAsync(storageKey, encrypted.Ciphertext, ct);

                var attachmentRef = new CommsAttachmentReference(
                    FileKey: storageKey,
                    FileName: scanResult.FileName,
                    ContentType: scanResult.ContentType,
                    SizeBytes: scanResult.FileSizeBytes,
                    HashSha256: scanResult.HashSha256
                );

                return Results.Ok(ApiResponse<CommsAttachmentReference>.Success(attachmentRef));
            })
            .DisableAntiforgery()
            .WithName("UploadCommunicationAttachment")
            .WithSummary("Sanitize, transcode HEIC/WebP, strip EXIF, encrypt AES-256-GCM, and store attachment")
            .Produces<ApiResponse<CommsAttachmentReference>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status413PayloadTooLarge)
            .Produces<ApiResponse<object>>(StatusCodes.Status415UnsupportedMediaType);

        // 9. GET /api/v1/patient/eligibility-grants
        group.MapGet("/eligibility-grants", async (
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new GetPatientEligibilityGrantsQuery(userId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<PatientEligibilityGrantDto>>.Success(result));
            })
            .WithName("GetPatientEligibilityGrants")
            .WithSummary("Get active communication eligibility grants for patient and dependents")
            .Produces<ApiResponse<IReadOnlyList<PatientEligibilityGrantDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized);
    }
}
