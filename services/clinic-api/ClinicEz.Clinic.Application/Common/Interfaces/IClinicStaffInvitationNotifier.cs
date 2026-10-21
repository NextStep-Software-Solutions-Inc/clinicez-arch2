using System;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicStaffInvitationNotifier
{
    string BuildInviteUrl(string token, string? tenantSlug = null, string? facilitySlug = null);
    void EnqueueInvitationEmail(string tenantId, Guid clinicId, string clinicName, string? tenantSlug, string? facilitySlug, StaffMember staff, string token);
}
