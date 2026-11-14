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

    public CreateTeleconsultGuestInviteCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropPublisher publisher,
        IConfiguration configuration,
        ILogger<CreateTeleconsultGuestInviteCommandHandler> logger)
    {
        _appointmentRepo = appointmentRepo;
        _patientRepo = patientRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _configuration = configuration;
        _logger = logger;
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
            IssuedAtUtc: DateTime.UtcNow);

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
