using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Common;

internal static class YakapWorkflowHelpers
{
    public static string ResolveAccreditation9(string? accreditationNumber)
    {
        if (string.IsNullOrWhiteSpace(accreditationNumber))
        {
            return "H00000001";
        }

        var clean = new string(accreditationNumber
            .Trim()
            .ToUpperInvariant()
            .Where(char.IsLetterOrDigit)
            .ToArray());

        if (clean.Length == 0)
        {
            return "H00000001";
        }

        return clean.Length >= 9 ? clean[^9..] : clean.PadLeft(9, '0');
    }

    public static string Clamp(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    public static string ComputeSha256Hex(string content) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();

    public static DateOnly ResolveManilaDate(DateTime utcNow)
    {
        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz));
    }

    public static string FormatMmDdYyyy(DateOnly date) =>
        date.ToString("MM/dd/yyyy", CultureInfo.InvariantCulture);

    public static DateOnly? ParseMmDdYyyy(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateOnly.TryParseExact(raw.Trim(), ["MM/dd/yyyy", "M/d/yyyy", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
        {
            return d;
        }
        return DateOnly.TryParse(raw.Trim(), out var fallback) ? fallback : null;
    }

    public static async Task<DateOnly> ResolveTodayAsync(
        IWorkspaceProfileProvider? workspaceProfiles,
        string tenantId,
        IRepository<FacilitySettings>? settingsRepo,
        CancellationToken ct) =>
        await ClinicTimeZoneResolver.ResolveTodayAsync(workspaceProfiles, tenantId, ct, settingsRepo);

    public static async Task<PatientIdentityVerification?> GetLatestVerifiedForPatientAsync(
        IRepository<PatientIdentityVerification>? verificationRepo,
        Guid clinicId,
        Guid patientId,
        CancellationToken ct)
    {
        if (verificationRepo == null) return null;
        return await verificationRepo
            .Query(v => v.PatientId == patientId && v.ClinicId == clinicId && !v.IsDeleted && v.VerifiedAtUtc != null)
            .OrderByDescending(v => v.VerifiedAtUtc)
            .FirstOrDefaultAsync(ct);
    }

    public static string MapVerificationModeString(YakapVerificationMode mode) => mode switch
    {
        YakapVerificationMode.PCU => "PCU",
        YakapVerificationMode.OTP => "OTP",
        YakapVerificationMode.VALID_ID => "VALID_ID",
        _ => "VALID_ID"
    };

    public sealed record ConflictingPinOwner(Guid PatientId, string PatientCode, string FullName);

    /// <summary>
    /// Checks whether a 12-digit PhilHealth PIN is already assigned to another active patient in the clinic.
    /// Compares both hyphenated and normalized 12-digit representations across Patient.PhilHealthNumber and
    /// PatientPhilHealthMembership.MemberPin.
    /// </summary>
    public static async Task<ConflictingPinOwner?> FindExistingPinOwnerAsync(
        IRepository<Patient>? patientRepo,
        IRepository<PatientPhilHealthMembership>? membershipRepo,
        Guid clinicId,
        string? candidatePin,
        Guid? excludePatientId,
        CancellationToken ct)
    {
        var rawDigits = PhilHealthPinNormalizer.Normalize(candidatePin);
        if (string.IsNullOrWhiteSpace(rawDigits))
        {
            return null;
        }

        var formattedPin = PhilHealthPinNormalizer.FormatHyphenated(candidatePin);

        if (patientRepo != null)
        {
            var existingPatient = await patientRepo
                .Query(p =>
                    !p.IsDeleted &&
                    p.ClinicId == clinicId &&
                    (!excludePatientId.HasValue || p.Id != excludePatientId.Value) &&
                    p.PhilHealthNumber != null &&
                    p.PhilHealthNumber != "" &&
                    (p.PhilHealthNumber == formattedPin ||
                     p.PhilHealthNumber == rawDigits ||
                     p.PhilHealthNumber.Replace("-", "").Trim() == rawDigits))
                .AsNoTracking()
                .Select(p => new { p.Id, p.PatientCode, p.FirstName, p.LastName })
                .FirstOrDefaultAsync(ct);

            if (existingPatient != null)
            {
                var fullName = $"{existingPatient.LastName}, {existingPatient.FirstName}".Trim(' ', ',');
                return new ConflictingPinOwner(existingPatient.Id, existingPatient.PatientCode, fullName);
            }
        }

        if (membershipRepo != null)
        {
            var existingMembership = await membershipRepo
                .Query(m =>
                    !m.IsDeleted &&
                    m.ClinicId == clinicId &&
                    (!excludePatientId.HasValue || m.PatientId != excludePatientId.Value) &&
                    m.MemberPin != null &&
                    m.MemberPin != "" &&
                    (m.MemberPin == formattedPin ||
                     m.MemberPin == rawDigits ||
                     m.MemberPin.Replace("-", "").Trim() == rawDigits))
                .AsNoTracking()
                .Select(m => new { m.PatientId })
                .FirstOrDefaultAsync(ct);

            if (existingMembership != null)
            {
                var owner = patientRepo != null
                    ? await patientRepo
                        .Query(p => p.Id == existingMembership.PatientId && !p.IsDeleted)
                        .AsNoTracking()
                        .Select(p => new { p.PatientCode, p.FirstName, p.LastName })
                        .FirstOrDefaultAsync(ct)
                    : null;
                var fullName = owner != null
                    ? $"{owner.LastName}, {owner.FirstName}".Trim(' ', ',')
                    : "Another registered patient";
                return new ConflictingPinOwner(
                    existingMembership.PatientId,
                    owner?.PatientCode ?? string.Empty,
                    fullName);
            }
        }

        return null;
    }
}
