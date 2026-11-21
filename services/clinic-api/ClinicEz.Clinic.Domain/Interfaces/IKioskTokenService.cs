using System;

namespace ClinicEz.Clinic.Domain.Interfaces;

public interface IKioskTokenService
{
    (string Token, DateTime ExpiresAtUtc) MintToken(
        string tenantId,
        Guid clinicId,
        int tokenVersion,
        string? deviceLabel = null,
        int? expiryDays = null);
}
