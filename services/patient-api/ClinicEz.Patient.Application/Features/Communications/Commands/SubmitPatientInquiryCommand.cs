using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

    public SubmitPatientInquiryCommandHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo,
        IUnitOfWork uow,
        IInteropPublisher publisher)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
        _uow = uow;
        _publisher = publisher;
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

        // 3. Active Eligibility Grant Check
        var now = DateTime.UtcNow;
        var grant = await _commsRepo.GetActiveGrantAsync(targetPatientId, request.FacilityId, now, ct);
        if (grant == null)
        {
            throw new ValidationException("No active communication eligibility grant found for this facility.");
        }

        // 4. Create Local PatientConversation Replica
        var conversationId = Guid.NewGuid();
        var clientMessageId = Guid.NewGuid();
        var retentionDeadline = now.AddDays(7);

        var conversation = new PatientConversation
        {
            Id = conversationId,
            PatientId = targetPatientId,
            HomeTenantId = request.TenantId,
            HomeFacilityId = request.FacilityId,
            HomeFacilityType = request.FacilityType,
            FacilityName = request.FacilityName,
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

        if (request.Attachments != null && request.Attachments.Count > 0)
        {
            foreach (var att in request.Attachments)
            {
                message.Attachments.Add(new PatientMessageAttachment
                {
                    Id = Guid.NewGuid(),
                    MessageId = message.Id,
                    StorageKey = att.FileKey,
                    FileName = att.FileName,
                    ContentType = att.ContentType,
                    FileSizeBytes = att.SizeBytes,
                    HashSha256 = att.HashSha256,
                    IsClean = true,
                    ScanStatus = "Clean"
                });
            }
        }

        await _commsRepo.AddConversationAsync(conversation, ct);
        await _commsRepo.AddMessageAsync(message, ct);

        // 5. Enqueue Outbound Interop Envelope: comms.request.submit
        var payload = new CommsRequestSubmitPayload(
            RequestId: conversationId,
            TenantId: request.TenantId,
            FacilityId: request.FacilityId,
            FacilityType: request.FacilityType,
            PatientId: targetPatientId,
            SubmittingAccountId: isDependent ? callerPatient.Id : null,
            Relationship: isDependent ? relationshipToPatient : null,
            Category: request.Category,
            ContentText: request.ContentText,
            IsEmergencyConfirmed: false,
            Attachments: request.Attachments,
            SubmittedAtUtc: now
        );

        _publisher.Enqueue(
            InteropTypes.CommsRequestSubmit,
            Party.ForPatient(targetPatientId.ToString()),
            Party.ForFacility(request.TenantId, request.FacilityId, FacilityType.Clinic, InteropServices.Comms),
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
