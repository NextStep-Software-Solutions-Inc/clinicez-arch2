using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClinicStaffInvitationNotifier : IClinicStaffInvitationNotifier
{
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _config;
    private readonly ILogger<ClinicStaffInvitationNotifier> _logger;

    public ClinicStaffInvitationNotifier(
        IInteropPublisher publisher,
        IConfiguration config,
        ILogger<ClinicStaffInvitationNotifier> logger)
    {
        _publisher = publisher;
        _config = config;
        _logger = logger;
    }

    public string BuildInviteUrl(string token, string? tenantSlug = null, string? facilitySlug = null)
    {
        var explicitBaseUrl = _config["ClinicApp:BaseUrl"] ?? _config["Frontend:BaseUrl"];
        if (!string.IsNullOrWhiteSpace(explicitBaseUrl))
        {
            return $"{explicitBaseUrl.TrimEnd('/')}/invitations/{token}";
        }

        var baseDomain = _config["Facility:ClinicDomain"] ?? _config["Facility:BaseDomain"];
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            var cleanedDomain = baseDomain.Trim().TrimStart('.');
            if (!string.IsNullOrWhiteSpace(facilitySlug))
            {
                return $"https://{facilitySlug}.clinic.{cleanedDomain}/invitations/{token}";
            }
            if (!string.IsNullOrWhiteSpace(tenantSlug))
            {
                return $"https://{tenantSlug}.clinic.{cleanedDomain}/invitations/{token}";
            }
            return $"https://{cleanedDomain}/invitations/{token}";
        }

        return $"http://localhost:8081/invitations/{token}";
    }

    public void EnqueueInvitationEmail(
        string tenantId,
        Guid clinicId,
        string clinicName,
        string? tenantSlug,
        string? facilitySlug,
        StaffMember staff,
        string token)
    {
        if (string.IsNullOrWhiteSpace(staff.Email))
        {
            _logger.LogWarning("Skipping invitation email for staff member {StaffId}: no email provided.", staff.Id);
            return;
        }

        var inviteUrl = BuildInviteUrl(token, tenantSlug, facilitySlug);

        var payload = new NotificationEmailRequestedPayload
        {
            To = staff.Email.Trim(),
            Subject = $"Invitation to join {clinicName} on Clinic EZ",
            TemplateKey = "clinic.staff.invitation",
            Model = new Dictionary<string, string>
            {
                ["inviteeName"] = $"{staff.FirstName} {staff.LastName}".Trim(),
                ["clinicName"] = clinicName,
                ["role"] = staff.Role.ToString(),
                ["inviteUrl"] = inviteUrl
            },
            FromFacilityName = clinicName
        };

        _publisher.Enqueue(
            InteropTypes.NotificationEmailRequested,
            Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic),
            Party.Portal,
            Guid.NewGuid(),
            payload);

        _logger.LogInformation("Enqueued clinic staff invitation email for staff member {StaffId} to {Email}.", staff.Id, staff.Email);
    }
}
