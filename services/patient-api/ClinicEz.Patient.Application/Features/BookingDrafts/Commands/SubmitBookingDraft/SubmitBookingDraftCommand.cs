using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using MassTransit;
using MediatR;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;

public sealed record SubmitBookingDraftCommand(Guid PatientId, Guid DraftId) : IRequest<string?>;

public sealed class SubmitBookingDraftCommandHandler : IRequestHandler<SubmitBookingDraftCommand, string?>
{
    private readonly IBookingDraftRepository _draftRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicDashboardService _clinicService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _uow;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly IPatientRepository _patientRepo;
    private readonly IFileRecordRepository? _fileRepo;

    public SubmitBookingDraftCommandHandler(
        IBookingDraftRepository draftRepo, IClinicRepository clinicRepo,
        IClinicDashboardService clinicService, ICurrentUserService currentUserService, IUnitOfWork uow,
        IClinicMembershipRepository membershipRepo, IPublishEndpoint publishEndpoint,
        IPatientRepository patientRepo, IFileRecordRepository? fileRepo = null)
    {
        _draftRepo = draftRepo; _clinicRepo = clinicRepo;
        _clinicService = clinicService; _currentUserService = currentUserService; _uow = uow;
        _membershipRepo = membershipRepo;
        _publishEndpoint = publishEndpoint;
        _patientRepo = patientRepo;
        _fileRepo = fileRepo;
    }

    public async Task<string?> Handle(SubmitBookingDraftCommand request, CancellationToken cancellationToken)
    {
        var draft = await _draftRepo.GetByIdAsync(request.DraftId, cancellationToken)
            ?? throw new NotFoundException($"Booking draft '{request.DraftId}' was not found.");

        if (draft.PatientId != request.PatientId)
            throw new ForbiddenException("This booking draft does not belong to the requesting patient.");

        if (draft.Status == BookingDraftStatus.Ready)
            throw new ConflictException("Booking has already been submitted.");

        var clinic = await _clinicRepo.GetByIdAsync(draft.ClinicId, cancellationToken)
            ?? throw new NotFoundException($"Clinic '{draft.ClinicId}' was not found.");

        var patient = await _patientRepo.GetWithProfileAsync(request.PatientId, cancellationToken);
        var philhealth = patient?.GovernmentIds.FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth);

        var bearerToken = _currentUserService.UserId ?? string.Empty;
        var bookingRef = await _clinicService.SubmitBookingAsync(
            clinic.BaseUrl, request.PatientId, draft.Id,
            draft.ShareFieldsJson, draft.AttachedFileIdsJson, bearerToken, cancellationToken);

        var attachedItems = new List<BookedAttachmentItem>();
        if (_fileRepo != null && !string.IsNullOrWhiteSpace(draft.AttachedFileIdsJson) && draft.AttachedFileIdsJson != "[]")
        {
            try
            {
                var fileIds = System.Text.Json.JsonSerializer.Deserialize<List<Guid>>(draft.AttachedFileIdsJson);
                if (fileIds != null && fileIds.Count > 0)
                {
                    foreach (var fileId in fileIds)
                    {
                        var file = await _fileRepo.GetByIdAsync(fileId, cancellationToken);
                        if (file != null && file.PatientId == request.PatientId)
                        {
                            attachedItems.Add(new BookedAttachmentItem
                            {
                                FileId = file.Id,
                                FileName = file.FileName,
                                DocumentTypeCode = file.DocumentType?.Code,
                                MimeType = file.MimeType,
                                SizeBytes = file.SizeBytes
                            });
                        }
                    }
                }
            }
            catch
            {
                // Degrade gracefully if json parse fails
            }
        }

        await _publishEndpoint.Publish(new AppointmentBookedEvent
        {
            DraftId = draft.Id,
            PatientId = request.PatientId,
            ClinicId = clinic.Id,
            PreferredDate = draft.PreferredDate,
            PreferredTime = draft.PreferredTime,
            Reason = draft.Reason,
            Notes = draft.Notes,
            ShareFieldsJson = draft.ShareFieldsJson,
            AttachedFileIdsJson = draft.AttachedFileIdsJson,
            AttachedFiles = attachedItems,
            CreatedAt = DateTime.UtcNow,
            PatientFirstName = patient?.FirstName,
            PatientMiddleName = patient?.MiddleName,
            PatientLastName = patient?.LastName,
            PatientSuffix = patient?.Suffix,
            DateOfBirth = patient?.DateOfBirth,
            Gender = patient?.Sex?.ToString(),
            ContactNumber = patient?.Mobile,
            Email = patient?.Email,
            PhilHealthNumber = philhealth?.IdNumber,
            PhilHealthCategory = philhealth?.PhilhealthCategory,
            SponsorPin = philhealth?.SponsorPin,
            SponsorLastName = philhealth?.SponsorLastName,
            SponsorFirstName = philhealth?.SponsorFirstName,
            SponsorMiddleName = philhealth?.SponsorMiddleName,
            SponsorSuffix = philhealth?.SponsorSuffix,
            SponsorDob = philhealth?.SponsorDob,
            SponsorRelationship = philhealth?.SponsorRelationship
        }, cancellationToken);

        var membership = await _membershipRepo.GetByPatientAndClinicAsync(request.PatientId, clinic.Id, cancellationToken);
        if (membership is null && clinic.IsPublic)
        {
            membership = new ClinicMembership
            {
                PatientId = request.PatientId,
                ClinicId = clinic.Id,
                Status = ClinicMembershipStatus.Pending,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                ConsentedAt = DateTime.UtcNow
            };
            await _membershipRepo.AddAsync(membership, cancellationToken);
        }

        draft.Status = BookingDraftStatus.Ready;
        _draftRepo.Update(draft);
        await _uow.SaveChangesAsync(cancellationToken);

        return bookingRef;
    }
}
