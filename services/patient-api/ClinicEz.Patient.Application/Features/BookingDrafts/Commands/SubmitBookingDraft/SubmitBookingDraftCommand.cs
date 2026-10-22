using System.Text.Json;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.Extensions.Options;
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

    /// <summary>Largest unencrypted attachment shared with the clinic by reference; bigger or encrypted files travel as metadata only.</summary>
    private const long MaxSharedAttachmentBytes = 10 * 1024 * 1024;
    private static readonly TimeSpan AttachmentLinkLifetime = TimeSpan.FromHours(24);

    private readonly IBookingDraftRepository _draftRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IUnitOfWork _uow;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IInteropPublisher _publisher;
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientAccessRepository _accessRepo;
    private readonly IStorageService _storage;
    private readonly SharingOptions _sharingOptions;
    private readonly PatientShareSnapshotBuilder _snapshots;
    private readonly IFileRecordRepository? _fileRepo;
    private readonly IPatientEncryptionService? _encryptionService;

    public SubmitBookingDraftCommandHandler(
        IBookingDraftRepository draftRepo, IClinicRepository clinicRepo, IUnitOfWork uow,
        IClinicMembershipRepository membershipRepo, IInteropPublisher publisher,
        IPatientRepository patientRepo, IPatientAccessRepository accessRepo, IStorageService storage,
        IOptions<SharingOptions> sharingOptions, PatientShareSnapshotBuilder snapshots,
        IFileRecordRepository? fileRepo = null,
        IPatientEncryptionService? encryptionService = null)
    {
        _draftRepo = draftRepo; _clinicRepo = clinicRepo; _uow = uow;
        _membershipRepo = membershipRepo;
        _publisher = publisher;
        _patientRepo = patientRepo;
        _accessRepo = accessRepo;
        _storage = storage;
        _sharingOptions = sharingOptions.Value;
        _snapshots = snapshots;
        _fileRepo = fileRepo;
        _encryptionService = encryptionService;
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
        var attachedFiles = new List<FileRecord>();
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
                            attachedFiles.Add(file);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // Degrade gracefully if json parse fails
            }
        }

        // Only the sections the patient ticked are read, so nothing else can leave in the booking.
        var sections = (SharingScopes)(int)draft.ShareSections & ~SharingScopes.Demographics;
        var sharedContent = sections == SharingScopes.None ? null : await _snapshots.BuildAsync(patient.Id, sections, cancellationToken);

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
            SponsorRelationship = philhealth?.SponsorRelationship,
            SharedScopes = SharingScopes.Demographics | sections,
            SharedItems = sharedContent?.Items ?? []
        };

        // Enqueued before the save below, so the outbox row and the booking commit atomically.
        _publisher.Enqueue(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(request.PatientId.ToString()),
            Party.ForFacility(clinic.TenantId, clinic.Id.ToString(), FacilityType.Clinic),
            draft.Id,
            booking);

        var clinicParty = Party.ForFacility(clinic.TenantId, clinic.Id.ToString(), FacilityType.Clinic);
        var sharedAttachmentCount = await ShareAttachmentsAsync(draft.Id, request.PatientId, clinicParty, attachedFiles, cancellationToken);
        await RecordGrantAsync(draft, request.PatientId, clinic.TenantId, clinicParty, shared, sections, sharedAttachmentCount, cancellationToken);

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

    // Attached files are decrypted with patient's PMK and shared with the clinic via FileBase64 (and fallback DownloadUrl).
    private async Task<int> ShareAttachmentsAsync(
        Guid draftId, Guid patientId, Party clinicParty, IReadOnlyList<FileRecord> files, CancellationToken cancellationToken)
    {
        var shared = 0;
        foreach (var file in files.Where(f =>
                     !string.IsNullOrEmpty(f.StorageKey) && f.SizeBytes <= MaxSharedAttachmentBytes))
        {
            var url = await _storage.GeneratePresignedDownloadUrlAsync(file.StorageKey, AttachmentLinkLifetime, cancellationToken);
            string? fileBase64 = null;

            if (_encryptionService != null
                && !string.IsNullOrWhiteSpace(file.WrappedKeyJson)
                && !string.IsNullOrWhiteSpace(file.EncryptionIvBase64)
                && !string.IsNullOrWhiteSpace(file.EncryptionTagBase64))
            {
                try
                {
                    var ciphertext = await _storage.DownloadAsync(file.StorageKey, cancellationToken);
                    var plaintext = await _encryptionService.DecryptAsync(
                        ciphertext,
                        file.EncryptionIvBase64,
                        file.EncryptionTagBase64,
                        file.WrappedKeyJson,
                        patientId,
                        cancellationToken);
                    fileBase64 = Convert.ToBase64String(plaintext);
                }
                catch
                {
                    // Fall back to DownloadUrl reference if decryption or storage download fails
                }
            }
            else
            {
                try
                {
                    var bytes = await _storage.DownloadAsync(file.StorageKey, cancellationToken);
                    fileBase64 = Convert.ToBase64String(bytes);
                }
                catch
                {
                    // Fall back to DownloadUrl reference
                }
            }

            _publisher.Enqueue(
                InteropTypes.PatientRecordShared,
                Party.ForPatient(patientId.ToString()),
                clinicParty,
                draftId,
                new PatientRecordSharedPayload
                {
                    DraftId = draftId,
                    PatientId = patientId,
                    FileId = file.Id,
                    FileName = file.FileName,
                    MimeType = file.MimeType,
                    SizeBytes = file.SizeBytes,
                    DocumentTypeCode = file.DocumentType?.Code,
                    DownloadUrl = url,
                    ExpiresAtUtc = DateTime.UtcNow.Add(AttachmentLinkLifetime),
                    FileBase64 = fileBase64
                });
            shared++;
        }

        return shared;
    }

    private async Task RecordGrantAsync(
        BookingDraft draft, Guid patientId, string tenantId, Party clinicParty, HashSet<string> shared, SharingScopes sections,
        int sharedAttachmentCount, CancellationToken cancellationToken)
    {
        var grant = new PatientAccessGrant
        {
            PatientId = patientId,
            TenantId = tenantId,
            FacilityId = draft.ClinicId,
            Scopes = AccessScopes.Demographics | (AccessScopes)(int)sections,
            Purpose = "Appointment booking",
            ExpiresAt = DateTime.UtcNow.AddDays(_sharingOptions.BookingGrantDays),
            Source = AccessGrantSource.Booking,
            DraftId = draft.Id
        };
        await _accessRepo.AddGrantAsync(grant, cancellationToken);

        var fields = new List<string> { "name", "mobile number" };
        fields.AddRange(new[] { ShareDateOfBirth, ShareSex, ShareEmail, SharePhilHealthId }.Where(shared.Contains));
        fields.AddRange(SharingScopeMap.ToNames(sections));
        if (sharedAttachmentCount > 0)
            fields.Add($"{sharedAttachmentCount} attachment(s)");

        await _accessRepo.AddLogAsync(new PatientAccessLog
        {
            PatientId = patientId,
            GrantId = grant.Id,
            Actor = clinicParty.Address,
            Action = "BookingShared",
            Detail = $"Shared with the booking: {string.Join(", ", fields)}"
        }, cancellationToken);
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
