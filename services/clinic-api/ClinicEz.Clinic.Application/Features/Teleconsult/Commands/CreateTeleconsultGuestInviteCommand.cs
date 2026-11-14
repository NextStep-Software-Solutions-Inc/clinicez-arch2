using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Licensing;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Teleconsult.Commands;

public sealed record CreateTeleconsultGuestInviteCommand(Guid AppointmentId) : IRequest<TeleconsultGuestInviteDto>;

public sealed record TeleconsultGuestInviteDto(
    string InviteToken,
    string InviteUrl,
    string Otp,
    DateTime ExpiresAtUtc,
    string? DobHint = null);

public sealed class CreateTeleconsultGuestInviteCommandHandler : IRequestHandler<CreateTeleconsultGuestInviteCommand, TeleconsultGuestInviteDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CreateTeleconsultGuestInviteCommandHandler> _logger;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IFacilityLicenseValidator? _licenseValidator;

    public CreateTeleconsultGuestInviteCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropPublisher publisher,
        IConfiguration configuration,
        ILogger<CreateTeleconsultGuestInviteCommandHandler> logger,
        IRepository<FacilitySettings>? settingsRepo = null,
        IFacilityLicenseValidator? licenseValidator = null)
    {
        _appointmentRepo = appointmentRepo;
        _patientRepo = patientRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _configuration = configuration;
        _logger = logger;
        _settingsRepo = settingsRepo;
        _licenseValidator = licenseValidator;
    }

    public async Task<TeleconsultGuestInviteDto> Handle(CreateTeleconsultGuestInviteCommand request, CancellationToken ct)
    {
        // 1. RBAC Check
        if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite) &&
            !_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign) &&
            !_clinicContext.HasPermission(ClinicPermissions.AppointmentsManage))
        {
            throw new ForbiddenException("Staff requires ConsultationsWrite, ConsultationsSign, or AppointmentsManage authority to issue guest invites.");
        }

        // 2. Fetch appointment
        var appointment = await _appointmentRepo.Query()
            .Include(a => a.Patient)
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        if (!appointment.IsTeleconsult)
        {
            throw new BadRequestException("Appointment is not a teleconsultation.");
        }

        FacilitySettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);

            if (settings != null && !string.IsNullOrWhiteSpace(settings.LicenseToken))
            {
                var validator = _licenseValidator ?? new FacilityLicenseValidator();
                var validation = validator.Validate(settings.LicenseToken, _clinicContext.ClinicId, _clinicContext.TenantId);
                var isWorkspaceEntitled = validation.IsValid &&
                    validation.Payload?.EnabledFeatures != null &&
                    validation.Payload.EnabledFeatures.Contains(FacilityFeatureKeys.Teleconsultation, StringComparer.OrdinalIgnoreCase);

                var effectiveEnabled = isWorkspaceEntitled && settings.EnableTeleconsultation;
                if (!effectiveEnabled)
                {
                    throw new ForbiddenException("Teleconsultation is not enabled for this clinic.");
                }
            }
        }

        if (!appointment.CallId.HasValue)
        {
            appointment.CallId = Guid.NewGuid();
            await _unitOfWork.SaveChangesAsync(ct);
        }

        var callId = appointment.CallId.Value;

        // 3. Fetch patient date of birth
        var patient = appointment.Patient ?? await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId && p.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Patient record {appointment.PatientId} not found.");

        var dobString = patient.DateOfBirth.ToString("yyyy-MM-dd");

        // 4. Generate random 32-hex lowercase token and 6-digit OTP
        var inviteToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var otp = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(60);

        // 5. Compute SHA-256 hashes matching portal GuestVerificationService
        var inviteTokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(inviteToken.Trim()))).ToLowerInvariant();
        var expectedDobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointment.Id:N}:{dobString}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointment.Id:N}:{otp}"))).ToLowerInvariant();

        // 5b. Encrypt patient display name with AES-256-GCM using key SHA256(appointmentId:dob:otp)
        var patientFullName = !string.IsNullOrWhiteSpace(appointment.PatientName)
            ? appointment.PatientName
            : $"{patient.FirstName} {patient.LastName}".Trim();

        var aesKey = SHA256.HashData(Encoding.UTF8.GetBytes($"{appointment.Id:N}:{dobString}:{otp}"));
        var plainBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { patientDisplayName = patientFullName }, InteropJson.Options));
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cipher = new byte[plainBytes.Length];

        using (var aesGcm = new AesGcm(aesKey, 16))
        {
            aesGcm.Encrypt(nonce, plainBytes, cipher, tag);
        }

        var encryptedBlob = new byte[12 + 16 + cipher.Length];
        Buffer.BlockCopy(nonce, 0, encryptedBlob, 0, 12);
        Buffer.BlockCopy(tag, 0, encryptedBlob, 12, 16);
        Buffer.BlockCopy(cipher, 0, encryptedBlob, 28, cipher.Length);
        var encryptedGuestContext = Convert.ToBase64String(encryptedBlob);

        var clinicName = settings?.ClinicName ?? "ClinicEZ Healthcare";
        var clinicSupportPhone = settings?.LetterheadContact ?? settings?.LetterheadSubHeader;
        var clinicianName = appointment.DoctorName ?? _clinicContext.StaffName;
        DateTime? scheduledAtUtc = appointment.ScheduledAt;

        // 6. Enqueue GuestTeleconsultInviteIssuedPayload to Party.Portal
        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointment.Id,
            CallId: callId,
            TenantId: _clinicContext.TenantId,
            FacilityId: _clinicContext.ClinicId.ToString(),
            InviteTokenHash: inviteTokenHash,
            ExpectedDobHash: expectedDobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: expiresAtUtc,
            IssuedAtUtc: DateTime.UtcNow,
            ClinicName: clinicName,
            ClinicSupportPhone: clinicSupportPhone,
            ClinicianName: clinicianName,
            ScheduledAtUtc: scheduledAtUtc,
            EncryptedGuestContext: encryptedGuestContext);

        _publisher.Enqueue(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
            Party.Portal,
            appointment.Id,
            payload);

        // 7. WORM Audit Log
        var now = DateTime.UtcNow;
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.guest_invite.issued",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Staff",
            ActorRole = _clinicContext.StaffRole ?? "Staff",
            TargetEntityType = "Appointment",
            TargetEntityId = appointment.Id.ToString(),
            PatientId = appointment.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Guest teleconsultation invite issued for Appointment {appointment.Id}.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                AppointmentId = appointment.Id,
                CallId = callId,
                ExpiresAtUtc = expiresAtUtc,
                InviteTokenHash = inviteTokenHash
            }, InteropJson.Options)
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var portalBaseUrl = ResolvePortalBaseUrl();
        var inviteUrl = $"{portalBaseUrl.TrimEnd('/')}/teleconsult/join?token={Uri.EscapeDataString(inviteToken)}";
        var dobHint = $"{patient.DateOfBirth.Year}-**-**";

        return new TeleconsultGuestInviteDto(
            InviteToken: inviteToken,
            InviteUrl: inviteUrl,
            Otp: otp,
            ExpiresAtUtc: expiresAtUtc,
            DobHint: dobHint);
    }

    private string ResolvePortalBaseUrl()
    {
        var configuredCandidates = new[]
        {
            _configuration["Clinic:PortalBaseUrl"],
            _configuration["PORTAL_BASE_URL"],
            _configuration["Portal:BaseUrl"],
            _configuration["PortalBaseUrl"],
        };

        foreach (var candidate in configuredCandidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                return candidate.Trim().TrimEnd('/');
            }
        }

        var baseDomainCandidates = new[]
        {
            _configuration["Facility:BaseDomain"],
            _configuration["Tenancy:BaseDomain"],
            _configuration["BaseDomain"],
        };

        foreach (var domain in baseDomainCandidates)
        {
            if (!string.IsNullOrWhiteSpace(domain))
            {
                var cleaned = domain.Trim().TrimStart('.').TrimEnd('/');
                if (cleaned.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                    cleaned.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    return cleaned;
                }
                return $"https://{cleaned}";
            }
        }

        return "https://portal.clinicez.ph";
    }
}
