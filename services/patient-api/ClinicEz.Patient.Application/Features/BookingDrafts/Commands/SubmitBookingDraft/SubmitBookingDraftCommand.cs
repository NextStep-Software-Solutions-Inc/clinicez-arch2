using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using MediatR;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;

public sealed record SubmitBookingDraftCommand(Guid PatientId, Guid DraftId) : IRequest<string?>;

public sealed class SubmitBookingDraftCommandHandler : IRequestHandler<SubmitBookingDraftCommand, string?>
{
    // Keys of the patient-chosen sharing scope (the app's ShareableFieldKey). Name and mobile number are
    // the minimum a booking needs, so they are always sent; everything else is sent only when chosen.
    private const string ShareDateOfBirth = "dateOfBirth";
    private const string ShareSex = "sex";
    private const string ShareEmail = "email";
    private const string SharePhilHealthId = "philhealthId";

    private readonly IBookingDraftRepository _draftRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IUnitOfWork _uow;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IInteropPublisher _publisher;
    private readonly IPatientRepository _patientRepo;
    private readonly IFileRecordRepository? _fileRepo;

    public SubmitBookingDraftCommandHandler(
        IBookingDraftRepository draftRepo, IClinicRepository clinicRepo, IUnitOfWork uow,
        IClinicMembershipRepository membershipRepo, IInteropPublisher publisher,
        IPatientRepository patientRepo, IFileRecordRepository? fileRepo = null)
    {
        _draftRepo = draftRepo; _clinicRepo = clinicRepo; _uow = uow;
        _membershipRepo = membershipRepo;
        _publisher = publisher;
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

        if (string.IsNullOrWhiteSpace(clinic.TenantId))
            throw new ConflictException($"Clinic '{clinic.Name}' is not registered in the facility directory yet, so it cannot receive bookings.");

        var patient = await _patientRepo.GetWithProfileAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var shared = ParseShareFields(draft.ShareFieldsJson);
        var philhealth = shared.Contains(SharePhilHealthId)
            ? patient.GovernmentIds.FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth)
            : null;

        var attachedItems = new List<BookedAttachmentItem>();
        if (_fileRepo != null && !string.IsNullOrWhiteSpace(draft.AttachedFileIdsJson) && draft.AttachedFileIdsJson != "[]")
        {
            try
            {
                var fileIds = JsonSerializer.Deserialize<List<Guid>>(draft.AttachedFileIdsJson);
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
            catch (JsonException)
            {
                // Degrade gracefully if json parse fails
            }
        }

        var booking = new AppointmentBookedEvent
        {
            DraftId = draft.Id,
            PatientId = request.PatientId,
            ClinicId = clinic.Id,
            TenantId = clinic.TenantId,
            PreferredDate = draft.PreferredDate,
            PreferredTime = draft.PreferredTime,
            Reason = draft.Reason,
            Notes = draft.Notes,
            ShareFieldsJson = draft.ShareFieldsJson,
            AttachedFileIdsJson = draft.AttachedFileIdsJson,
            AttachedFiles = attachedItems,
            CreatedAt = DateTime.UtcNow,
            PatientFirstName = patient.FirstName,
            PatientMiddleName = patient.MiddleName,
            PatientLastName = patient.LastName,
            PatientSuffix = patient.Suffix,
            ContactNumber = patient.Mobile,
            DateOfBirth = shared.Contains(ShareDateOfBirth) ? patient.DateOfBirth : null,
            Gender = shared.Contains(ShareSex) ? patient.Sex?.ToString() : null,
            Email = shared.Contains(ShareEmail) ? patient.Email : null,
            PhilHealthNumber = philhealth?.IdNumber,
            PhilHealthCategory = philhealth?.PhilhealthCategory,
            SponsorPin = philhealth?.SponsorPin,
            SponsorLastName = philhealth?.SponsorLastName,
            SponsorFirstName = philhealth?.SponsorFirstName,
            SponsorMiddleName = philhealth?.SponsorMiddleName,
            SponsorSuffix = philhealth?.SponsorSuffix,
            SponsorDob = philhealth?.SponsorDob,
            SponsorRelationship = philhealth?.SponsorRelationship
        };

        // Enqueued before the save below, so the outbox row and the booking commit atomically.
        _publisher.Enqueue(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(request.PatientId.ToString()),
            Party.ForFacility(clinic.TenantId, clinic.Id.ToString(), FacilityType.Clinic),
            draft.Id,
            booking);

        var membership = await _membershipRepo.GetByPatientAndClinicAsync(request.PatientId, clinic.Id, cancellationToken);
        if (membership is null && clinic.IsPublic)
        {
            // Consents are never presumed: only an explicit join records them. What a booking shares is
            // governed by the draft's sharing scope above.
            membership = new ClinicMembership
            {
                PatientId = request.PatientId,
                ClinicId = clinic.Id,
                Status = ClinicMembershipStatus.Pending
            };
            await _membershipRepo.AddAsync(membership, cancellationToken);
        }

        draft.Status = BookingDraftStatus.Ready;
        _draftRepo.Update(draft);
        await _uow.SaveChangesAsync(cancellationToken);

        return $"PENDING-{draft.Id:N}";
    }

    private static HashSet<string> ParseShareFields(string shareFieldsJson)
    {
        try
        {
            var keys = JsonSerializer.Deserialize<List<string>>(shareFieldsJson) ?? [];
            return new HashSet<string>(keys, StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
