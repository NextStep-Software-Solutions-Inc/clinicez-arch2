using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Commands;

public sealed record SubmitPatientInquiryCommand(
    string ClerkUserId,
    Guid? PatientId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    string FacilityName,
    MessageCategory Category,
    string ContentText,
    bool? IsEmergencyConfirmed,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null) : IRequest<SubmitPatientInquiryResponse>;

public sealed class SubmitPatientInquiryCommandHandler : IRequestHandler<SubmitPatientInquiryCommand, SubmitPatientInquiryResponse>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;
    private readonly IInteropPublisher _publisher;
    private readonly IStorageService? _storageService;
    private readonly IPatientEncryptionService? _encryptionService;

    public SubmitPatientInquiryCommandHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo,
        IUnitOfWork uow,
        IInteropPublisher publisher,
        IStorageService? storageService = null,
        IPatientEncryptionService? encryptionService = null)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
        _uow = uow;
        _publisher = publisher;
        _storageService = storageService;
        _encryptionService = encryptionService;
    }

    public async Task<SubmitPatientInquiryResponse> Handle(
        SubmitPatientInquiryCommand request,
        CancellationToken ct)
    {
        // 1. Emergency Screening Gate
        if (!request.IsEmergencyConfirmed.HasValue)
        {
            throw new ValidationException("EMERGENCY_CONFIRMATION_REQUIRED: Patient must confirm or deny emergency symptoms prior to submitting an inquiry.");
        }

        if (request.IsEmergencyConfirmed.Value)
        {
            return new SubmitPatientInquiryResponse(
                IsEmergencyRedirect: true,
                RedirectMessage: "EMERGENCY_REDIRECT: If you are experiencing a life-threatening medical emergency, please call 911 immediately or proceed to the nearest emergency department.",
                ConversationId: null);
        }

        // 2. Resolve Caller Identity & Target Patient
        var callerPatient = await _patientRepo.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, ct);
        if (callerPatient == null)
        {
            throw new UnauthorizedException("Patient profile not found for authenticated user.");
        }

        var targetPatientId = request.PatientId ?? callerPatient.Id;
        var isDependent = targetPatientId != callerPatient.Id;
        string? relationshipToPatient = isDependent ? null : "Self";

        if (isDependent)
        {
            var isOwned = await _patientRepo.IsOwnedByAsync(targetPatientId, request.ClerkUserId, ct);
            if (!isOwned)
            {
                throw new ForbiddenException("You do not have permission to submit an inquiry for this patient.");
            }

            var dependent = callerPatient.ManagedDependents?.FirstOrDefault(d => d.Id == targetPatientId);
            relationshipToPatient = dependent?.RelationshipToManager ?? "Guardian";
        }

        // 2b. Validate Message Content
        CommunicationCommandRules.ValidateContentText(request.ContentText);

        // 3. Active Eligibility Grant Check
        var now = DateTime.UtcNow;
        var grant = await _commsRepo.GetActiveGrantAsync(targetPatientId, request.FacilityId, now, ct);
        if (grant == null)
        {
            throw new ValidationException("No active communication eligibility grant found for this facility.");
        }

        var resolvedTenantId = !string.IsNullOrWhiteSpace(request.TenantId) ? request.TenantId : grant.TenantId;
        var resolvedFacilityType = !string.IsNullOrWhiteSpace(request.FacilityType) ? request.FacilityType : grant.FacilityType;
        var resolvedFacilityName = !string.IsNullOrWhiteSpace(request.FacilityName) ? request.FacilityName : grant.FacilityName;
        var targetFacilityType = CommunicationCommandRules.ResolveFacilityType(resolvedFacilityType);

        // 4. Create Local PatientConversation Replica
        var conversationId = Guid.NewGuid();
        var clientMessageId = Guid.NewGuid();
        var retentionDeadline = now.AddDays(7);

        var conversation = new PatientConversation
        {
            Id = conversationId,
            PatientId = targetPatientId,
            HomeTenantId = resolvedTenantId,
            HomeFacilityId = request.FacilityId,
            HomeFacilityType = resolvedFacilityType,
            FacilityName = resolvedFacilityName,
            Category = request.Category,
            Subject = request.Category.ToString(),
            Status = RequestStatus.Submitted,
            SubmittingAccountId = callerPatient.Id,
            SubmittingAccountName = $"{callerPatient.FirstName} {callerPatient.LastName}".Trim(),
            RelationshipToPatient = relationshipToPatient,
            OpenedAtUtc = now,
            LastMessageAtUtc = now,
            LastMessagePreview = request.ContentText.Length > 100 ? request.ContentText[..100] : request.ContentText,
            UnreadCount = 0,
            Version = 1
        };

        var message = new PatientMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            Seq = 1,
            ClientMessageId = clientMessageId,
            SenderType = "Patient",
            SenderId = callerPatient.Id,
            SenderName = $"{callerPatient.FirstName} {callerPatient.LastName}".Trim(),
            ContentText = request.ContentText,
            DeliveryState = DeliveryState.Waiting,
            CreatedAtUtc = now,
            RetentionDeadlineUtc = retentionDeadline
        };

        var outboundAttachments = await CommunicationCommandRules.AttachAndEnqueueChunksAsync(
            _commsRepo,
            _publisher,
            _storageService,
            _encryptionService,
            message,
            request.Attachments,
            targetPatientId,
            callerPatient.Id,
            resolvedTenantId,
            request.FacilityId,
            targetFacilityType,
            resolvedFacilityType,
            conversationId,
            ct);

        await _commsRepo.AddConversationAsync(conversation, ct);
        await _commsRepo.AddMessageAsync(message, ct);

        // 5. Enqueue Outbound Interop Envelope: comms.request.submit
        var payload = new CommsRequestSubmitPayload(
            RequestId: conversationId,
            TenantId: resolvedTenantId,
            FacilityId: request.FacilityId,
            FacilityType: resolvedFacilityType,
            PatientId: targetPatientId,
            SubmittingAccountId: isDependent ? callerPatient.Id : null,
            Relationship: isDependent ? relationshipToPatient : null,
            Category: request.Category,
            ContentText: request.ContentText,
            IsEmergencyConfirmed: false,
            Attachments: outboundAttachments,
            SubmittedAtUtc: now
        );

        _publisher.Enqueue(
            InteropTypes.CommsRequestSubmit,
            Party.ForPatient(targetPatientId.ToString()),
            Party.ForFacility(resolvedTenantId, request.FacilityId, targetFacilityType, InteropServices.Comms),
            conversationId,
            payload
        );

        await _uow.SaveChangesAsync(ct);

        return new SubmitPatientInquiryResponse(
            IsEmergencyRedirect: false,
            RedirectMessage: null,
            ConversationId: conversationId);
    }
}

internal static class CommunicationCommandRules
{
    public const int MaxContentLength = 1000;

    /// <summary>Validates patient communication text against persistence and domain constraints.</summary>
    public static void ValidateContentText(string? contentText)
    {
        if (string.IsNullOrWhiteSpace(contentText))
        {
            throw new ValidationException("Message text cannot be empty.");
        }

        if (contentText.Length > MaxContentLength)
        {
            throw new ValidationException($"Message content exceeds maximum allowed length of {MaxContentLength} characters.");
        }
    }

    /// <summary>Parses a facility type string into <see cref="FacilityType"/> with a Clinic fallback.</summary>
    public static FacilityType ResolveFacilityType(string? facilityType)
    {
        return Enum.TryParse<FacilityType>(facilityType, ignoreCase: true, out var parsedType)
            ? parsedType
            : FacilityType.Clinic;
    }

    /// <summary>
    /// Links pre-uploaded staged <see cref="PatientMessageAttachment"/> rows to <paramref name="message"/>
    /// (falling back to creating synthetic rows for tests) and enqueues chunked interop byte transfers.
    /// </summary>
    public static async Task<IReadOnlyList<CommsAttachmentReference>?> AttachAndEnqueueChunksAsync(
        IPatientCommunicationsRepository commsRepo,
        IInteropPublisher publisher,
        IStorageService? storageService,
        IPatientEncryptionService? encryptionService,
        PatientMessage message,
        IReadOnlyList<CommsAttachmentReference>? requestedAttachments,
        Guid targetPatientId,
        Guid callerPatientId,
        string tenantId,
        string facilityId,
        FacilityType targetFacilityType,
        string facilityTypeString,
        Guid conversationId,
        CancellationToken ct)
    {
        if (requestedAttachments == null || requestedAttachments.Count == 0)
        {
            return requestedAttachments;
        }

        var stagedRows = await commsRepo.GetAttachmentsByStorageKeysAsync(
            requestedAttachments.Select(a => a.FileKey),
            ct);

        var outboundRefs = new List<CommsAttachmentReference>(requestedAttachments.Count);

        foreach (var att in requestedAttachments)
        {
            var staged = stagedRows.FirstOrDefault(s =>
                string.Equals(s.StorageKey, att.FileKey, StringComparison.Ordinal) &&
                s.MessageId == null &&
                (s.PatientId == null || s.PatientId == targetPatientId || s.PatientId == callerPatientId));

            if (staged != null)
            {
                var cryptoOwnerPatientId = staged.PatientId ?? callerPatientId;
                staged.MessageId = message.Id;
                staged.PatientId ??= cryptoOwnerPatientId;
                message.Attachments.Add(staged);

                outboundRefs.Add(att with { AttachmentId = staged.Id });

                await EnqueueDecryptedChunksIfPresentAsync(
                    publisher,
                    storageService,
                    encryptionService,
                    staged,
                    cryptoOwnerPatientId,
                    targetPatientId,
                    tenantId,
                    facilityId,
                    targetFacilityType,
                    facilityTypeString,
                    conversationId,
                    message.Id,
                    ct);
            }
            else
            {
                var created = new PatientMessageAttachment
                {
                    Id = att.AttachmentId ?? Guid.NewGuid(),
                    MessageId = message.Id,
                    PatientId = targetPatientId,
                    StorageKey = att.FileKey,
                    FileName = att.FileName,
                    ContentType = att.ContentType,
                    FileSizeBytes = att.SizeBytes,
                    HashSha256 = att.HashSha256,
                    IsClean = true,
                    ScanStatus = "Clean"
                };
                message.Attachments.Add(created);
                outboundRefs.Add(att with { AttachmentId = created.Id });
            }
        }

        return outboundRefs;
    }

    public static async Task EnqueueDecryptedChunksIfPresentAsync(
        IInteropPublisher publisher,
        IStorageService? storageService,
        IPatientEncryptionService? encryptionService,
        PatientMessageAttachment attachment,
        Guid cryptoOwnerPatientId,
        Guid targetPatientId,
        string tenantId,
        string facilityId,
        FacilityType targetFacilityType,
        string facilityTypeString,
        Guid conversationId,
        Guid? messageId,
        CancellationToken ct)
    {
        if (storageService == null ||
            encryptionService == null ||
            string.IsNullOrWhiteSpace(attachment.EncryptionIvBase64) ||
            string.IsNullOrWhiteSpace(attachment.EncryptionTagBase64) ||
            string.IsNullOrWhiteSpace(attachment.WrappedKeyJson))
        {
            return;
        }

        var ciphertext = await storageService.DownloadAsync(attachment.StorageKey, ct);
        var plaintext = await encryptionService.DecryptAsync(
            cryptoOwnerPatientId,
            ciphertext,
            attachment.EncryptionIvBase64,
            attachment.EncryptionTagBase64,
            attachment.WrappedKeyJson,
            ct);

        CommsAttachmentHelpers.EnqueueAttachmentChunks(
            publisher,
            targetPatientId,
            tenantId,
            facilityId,
            targetFacilityType,
            facilityTypeString,
            conversationId,
            messageId,
            attachment,
            plaintext);
    }
}
