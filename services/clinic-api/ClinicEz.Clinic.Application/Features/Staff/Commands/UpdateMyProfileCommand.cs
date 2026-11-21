using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record UpdateMyProfileCommand(
    Guid StaffId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    string? PhilHealthPan = null,
    StaffRole? RequestedRole = null,
    Guid? RequestedClinicRoleId = null,
    string? SignatureSpecimen = null,
    SignatureMode? DefaultSignatureMode = null,
    string? PreferencesJson = null,
    bool? IsDirectoryOptIn = null,
    DateOnly? PrcExpiryDate = null,
    string? PrcEvidenceObjectKey = null,
    string? VerificationContact = null,
    string? PublicBio = null,
    string? AvatarUrl = null,
    bool SkipPendingVerificationSync = false) : IRequest<StaffMemberDto>;

public sealed class UpdateMyProfileCommandValidator : AbstractValidator<UpdateMyProfileCommand>
{
    public UpdateMyProfileCommandValidator()
    {
        RuleFor(x => x.StaffId).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);

        When(x => !string.IsNullOrEmpty(x.PhilHealthPan), () =>
        {
            RuleFor(x => x.PhilHealthPan).MaximumLength(50);
        });
    }
}

public sealed class UpdateMyProfileCommandHandler : IRequestHandler<UpdateMyProfileCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;
    private readonly IRepository<Room>? _roomRepository;
    private readonly IInteropPublisher? _interopPublisher;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepository;
    private readonly IRepository<AuditEntry>? _auditRepository;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public UpdateMyProfileCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IStaffAccessInvalidator? accessCache = null,
        IRepository<Room>? roomRepository = null,
        IInteropPublisher? interopPublisher = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepository = null,
        IRepository<AuditEntry>? auditRepository = null,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _accessCache = accessCache;
        _roomRepository = roomRepository;
        _interopPublisher = interopPublisher;
        _settingsRepository = settingsRepository;
        _scheduleRepository = scheduleRepository;
        _auditRepository = auditRepository;
        _directorySyncService = directorySyncService;
    }

    public async Task<StaffMemberDto> Handle(UpdateMyProfileCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        if ((request.RequestedRole.HasValue && request.RequestedRole.Value != staff.Role) ||
            (request.RequestedClinicRoleId.HasValue && request.RequestedClinicRoleId.Value != staff.ClinicRoleId))
        {
            throw new ClinicEz.Shared.Exceptions.ValidationException("You cannot change or downgrade your own clinic role.");
        }

        if (staff.Role == StaffRole.Doctor && string.IsNullOrWhiteSpace(request.PrcLicenseNumber))
        {
            throw new ValidationException("PRC License Number is mandatory for Doctors.");
        }

        var prevFirstName = staff.FirstName;
        var prevLastName = staff.LastName;
        var prevTitle = staff.Title;
        var prevSpecialty = staff.Specialty;
        var previousPrc = staff.PrcLicenseNumber;
        var prevOptIn = staff.IsDirectoryOptIn;
        var prevExpiry = staff.PrcExpiryDate;
        var prevProofKey = staff.PrcEvidenceObjectKey;
        var prevVerificationContact = staff.VerificationContact;
        var prevPublicBio = staff.PublicBio;
        var prevAvatarUrl = staff.AvatarUrl;
        var wasVerified = staff.PublicVerificationStatus == PractitionerVerificationLevel.Verified;

        var effectiveOptIn = request.IsDirectoryOptIn ?? (ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role) && staff.IsDirectoryOptIn);
        var effectivePrc = request.PrcLicenseNumber?.Trim();
        var effectiveExpiry = request.PrcExpiryDate ?? staff.PrcExpiryDate;
        var effectiveProofKey = request.PrcEvidenceObjectKey != null
            ? (string.IsNullOrWhiteSpace(request.PrcEvidenceObjectKey) ? null : request.PrcEvidenceObjectKey.Trim())
            : staff.PrcEvidenceObjectKey;
        var effectiveContact = request.VerificationContact != null
            ? (string.IsNullOrWhiteSpace(request.VerificationContact) ? null : request.VerificationContact.Trim())
            : staff.VerificationContact;

        ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
            staff.Role,
            effectiveOptIn,
            effectivePrc,
            effectiveExpiry,
            effectiveProofKey,
            effectiveContact);

        staff.FirstName = request.FirstName.Trim();
        staff.LastName = request.LastName.Trim();
        staff.MiddleName = request.MiddleName?.Trim();
        staff.Title = request.Title?.Trim();
        staff.PhoneNumber = request.PhoneNumber?.Trim();
        staff.PrcLicenseNumber = effectivePrc;
        staff.PtrNumber = request.PtrNumber?.Trim();
        staff.S2LicenseNumber = request.S2LicenseNumber?.Trim();
        staff.Specialty = request.Specialty?.Trim();
        staff.PhilHealthPan = request.PhilHealthPan?.Trim();
        staff.IsDirectoryOptIn = effectiveOptIn;
        staff.PrcExpiryDate = effectiveExpiry;
        staff.PrcEvidenceObjectKey = effectiveProofKey;
        staff.VerificationContact = effectiveContact;
        if (request.PublicBio != null)
        {
            staff.PublicBio = string.IsNullOrWhiteSpace(request.PublicBio) ? null : request.PublicBio.Trim();
        }
        if (request.AvatarUrl != null)
        {
            staff.AvatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim();
        }
        if (request.SignatureSpecimen != null)
        {
            staff.SignatureSpecimen = string.IsNullOrWhiteSpace(request.SignatureSpecimen) ? null : request.SignatureSpecimen;
        }
        if (request.DefaultSignatureMode.HasValue)
        {
            staff.DefaultSignatureMode = request.DefaultSignatureMode.Value;
        }
        if (request.PreferencesJson != null)
        {
            staff.PreferencesJson = string.IsNullOrWhiteSpace(request.PreferencesJson) ? null : request.PreferencesJson;
        }
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = staff.Id.ToString();

        var triggeredPrcUpdateResubmission = false;
        if (wasVerified
            && staff.IsDirectoryOptIn
            && ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role)
            && ClinicianDirectoryValidationHelper.HasRegulatedPrcCredentialsChanged(
                previousPrc,
                staff.PrcLicenseNumber,
                prevExpiry,
                staff.PrcExpiryDate,
                prevProofKey,
                staff.PrcEvidenceObjectKey))
        {
            if (!PractitionerIdentity.IsValidPrcFormat(staff.PrcLicenseNumber))
            {
                throw new ValidationException("A valid PRC license number is required when updating a verified practitioner's license.");
            }

            staff.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
            staff.PublicVerificationReason = null;

            await PractitionerVerificationSubmissionHelper.EnqueueVerificationAndAuditAsync(
                staff,
                "PrcUpdate",
                staff.UpdatedAt.Value,
                _clinicContext,
                _directorySyncService,
                _interopPublisher,
                _settingsRepository,
                _scheduleRepository,
                _auditRepository,
                cancellationToken,
                _staffRepository);
            triggeredPrcUpdateResubmission = true;
        }

        _staffRepository.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var directoryProfileChanged =
            !string.Equals(prevFirstName, staff.FirstName, StringComparison.Ordinal) ||
            !string.Equals(prevLastName, staff.LastName, StringComparison.Ordinal) ||
            !string.Equals(prevTitle, staff.Title, StringComparison.Ordinal) ||
            !string.Equals(prevSpecialty, staff.Specialty, StringComparison.Ordinal) ||
            !string.Equals(previousPrc, staff.PrcLicenseNumber, StringComparison.Ordinal) ||
            prevOptIn != staff.IsDirectoryOptIn ||
            prevExpiry != staff.PrcExpiryDate ||
            !string.Equals(prevProofKey, staff.PrcEvidenceObjectKey, StringComparison.Ordinal) ||
            !string.Equals(prevVerificationContact, staff.VerificationContact, StringComparison.Ordinal) ||
            !string.Equals(prevPublicBio, staff.PublicBio, StringComparison.Ordinal) ||
            !string.Equals(prevAvatarUrl, staff.AvatarUrl, StringComparison.Ordinal);

        if (!request.SkipPendingVerificationSync
            && !triggeredPrcUpdateResubmission
            && directoryProfileChanged
            && _directorySyncService != null)
        {
            if (staff.IsActive
                && staff.IsDirectoryOptIn
                && ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role)
                && staff.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification)
            {
                await _directorySyncService.SyncPendingPractitionerVerificationAsync(
                    staff.Id,
                    throwOnConflict: false,
                    _clinicContext.StaffId?.ToString(),
                    _clinicContext.StaffName,
                    cancellationToken);
            }
            else if ((prevOptIn || staff.IsDirectoryOptIn) && _settingsRepository != null)
            {
                var settings = await _settingsRepository.Query().FirstOrDefaultAsync(cancellationToken);
                if (settings?.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
                {
                    await _directorySyncService.SyncPendingFacilityVerificationAsync(
                        settings,
                        throwOnConflict: false,
                        _clinicContext.StaffId?.ToString(),
                        _clinicContext.StaffName,
                        cancellationToken);
                }
            }
        }

        _accessCache?.Invalidate(staff.Id);

        var roomIds = staff.GetAssignedRoomIds();
        var roomNames = new List<string>();
        if (_roomRepository != null && roomIds.Count > 0)
        {
            var targetIds = roomIds.ToHashSet();
            var rooms = await _roomRepository.Query(r => r.ClinicId == _clinicContext.ClinicId && targetIds.Contains(r.Id))
                .ToListAsync(cancellationToken);
            var roomMap = rooms.ToDictionary(r => r.Id, r => r.Name);
            roomNames = roomIds.Where(id => roomMap.ContainsKey(id)).Select(id => roomMap[id]).ToList();
        }

        return StaffMemberDto.FromEntity(staff, staff.ClinicRole?.Name, roomNames);
    }
}
