using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Handles <see cref="InteropTypes.PatientLinkRequested"/> from <c>patient-api</c>.
/// Persists a <see cref="PatientLinkRequest"/> in <see cref="PatientLinkRequestStatus.PendingReview"/>
/// and runs non-destructive candidate match scoring against unlinked charts in this clinic (walk-in, guest, or backfilled)
/// using standard demographics plus any clinic-configured <c>IdentifierClaims</c> matched dynamically against <c>Patient.CustomFields</c>.
/// </summary>
public sealed class PatientLinkRequestedHandler : IInteropHandler<PatientLinkRequestedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<PatientLinkRequestedHandler> _logger;

    public PatientLinkRequestedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<PatientLinkRequestedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(PatientLinkRequestedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic is null) return;

        if (context.From.Kind != PartyKind.Patient ||
            !string.Equals(context.From.PatientId, message.PatientId.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "Ignoring patient.link.requested {MessageId}: sender {From} does not match PatientId {PatientId}.",
                context.MessageId, context.From.Address, message.PatientId);
            return;
        }

        var existing = await _dbContext.PatientLinkRequests
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.Id == message.LinkRequestId && r.ClinicId == clinic.ClinicId, ct);
        if (existing is not null)
        {
            if (existing.Status == PatientLinkRequestStatus.Approved)
            {
                _logger.LogInformation(
                    "[ClinicEz.Clinic] Ignoring patient.link.requested {LinkRequestId}: link request is already Approved.",
                    message.LinkRequestId);
                return;
            }

            if (existing.Status == PatientLinkRequestStatus.PendingReview &&
                message.RequestedAtUtc < existing.RequestedAtUtc)
            {
                _logger.LogInformation(
                    "[ClinicEz.Clinic] Ignoring stale patient.link.requested {LinkRequestId}: incoming timestamp {IncomingAt} predates {CurrentAt}.",
                    message.LinkRequestId, message.RequestedAtUtc, existing.RequestedAtUtc);
                return;
            }

            if (existing.Status == PatientLinkRequestStatus.Rejected &&
                message.RequestedAtUtc <= existing.RequestedAtUtc)
            {
                _logger.LogInformation(
                    "[ClinicEz.Clinic] Ignoring stale patient.link.requested {LinkRequestId}: link request was Rejected and incoming timestamp {IncomingAt} does not postdate {CurrentAt}.",
                    message.LinkRequestId, message.RequestedAtUtc, existing.RequestedAtUtc);
                return;
            }
        }

        var sanitizedClaims = SanitizeClaims(message.IdentifierClaims);
        var claimsValue = sanitizedClaims.Count > 0 ? sanitizedClaims : null;
        var candidates = await ScoreUnlinkedCandidatesAsync(clinic.ClinicId, message, sanitizedClaims, ct);
        var now = DateTime.UtcNow;

        if (existing is not null)
        {
            existing.ClinicEzId = message.ClinicEzId.Trim();
            existing.FirstName = message.FirstName.Trim();
            existing.MiddleName = message.MiddleName?.Trim();
            existing.LastName = message.LastName.Trim();
            existing.Suffix = message.Suffix?.Trim();
            existing.DateOfBirth = message.DateOfBirth;
            existing.VerifiedEmail = message.VerifiedEmail?.Trim();
            existing.ContactNumber = message.ContactNumber?.Trim();
            existing.Status = PatientLinkRequestStatus.PendingReview;
            existing.MatchedPatientId = null;
            existing.IdentifierClaims = claimsValue;
            existing.CandidateMatches = candidates;
            existing.RejectionReason = null;
            existing.ReviewedAtUtc = null;
            existing.ReviewedByStaffId = null;
            existing.ReviewedByStaffName = null;
            existing.RequestedAtUtc = message.RequestedAtUtc;
            existing.UpdatedAt = now;
            existing.UpdatedBy = "System:PatientLinkRequested";
        }
        else
        {
            await _dbContext.PatientLinkRequests.AddAsync(new PatientLinkRequest
            {
                Id = message.LinkRequestId,
                TenantId = clinic.TenantId,
                ClinicId = clinic.ClinicId,
                CloudPatientId = message.PatientId,
                ClinicEzId = message.ClinicEzId.Trim(),
                FirstName = message.FirstName.Trim(),
                MiddleName = message.MiddleName?.Trim(),
                LastName = message.LastName.Trim(),
                Suffix = message.Suffix?.Trim(),
                DateOfBirth = message.DateOfBirth,
                VerifiedEmail = message.VerifiedEmail?.Trim(),
                ContactNumber = message.ContactNumber?.Trim(),
                IdentifierClaims = claimsValue,
                Status = PatientLinkRequestStatus.PendingReview,
                CandidateMatches = candidates,
                RequestedAtUtc = message.RequestedAtUtc,
                CreatedAt = now,
                CreatedBy = "System:PatientLinkRequested"
            }, ct);
        }

        await _dbContext.SaveChangesAsync(ct);
        _logger.LogInformation(
            "[ClinicEz.Clinic] Persisted PatientLinkRequest {LinkRequestId} for clinic {ClinicId} with {Count} scored candidates.",
            message.LinkRequestId, clinic.ClinicId, candidates.Count);
    }

    private async Task<List<PatientLinkCandidateMatch>> ScoreUnlinkedCandidatesAsync(
        Guid clinicId,
        PatientLinkRequestedPayload message,
        Dictionary<string, string> claims,
        CancellationToken ct)
    {
        var emailLower = message.VerifiedEmail?.Trim().ToLowerInvariant();
        var lastLower = message.LastName.Trim().ToLowerInvariant();
        var firstLower = message.FirstName.Trim().ToLowerInvariant();
        var contactClean = NormalizeDigits(message.ContactNumber);

        var baseQuery = _dbContext.Patients
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(p => !p.IsDeleted && p.ClinicId == clinicId && p.CloudPatientId == null);

        var shortlist = await baseQuery
            .Where(p =>
                (emailLower != null && p.Email != null && p.Email.ToLower() == emailLower) ||
                p.LastName.ToLower() == lastLower ||
                (!string.IsNullOrEmpty(contactClean) && p.ContactNumber.Contains(contactClean)))
            .Take(200)
            .ToListAsync(ct);

        var seen = shortlist.Select(p => p.Id).ToHashSet();

        if (claims.TryGetValue("patient_code", out var patientCodeClaim) && !string.IsNullOrWhiteSpace(patientCodeClaim))
        {
            var codeLower = patientCodeClaim.Trim().ToLowerInvariant();
            var codeMatches = await baseQuery
                .Where(p => p.PatientCode.ToLower() == codeLower)
                .Take(20)
                .ToListAsync(ct);
            foreach (var p in codeMatches)
            {
                if (seen.Add(p.Id)) shortlist.Add(p);
            }
        }

        if (claims.TryGetValue("philhealth_pin", out var pinClaim) && !string.IsNullOrWhiteSpace(pinClaim))
        {
            var pinTrimmed = pinClaim.Trim();
            var pinDigits = new string(pinTrimmed.Where(char.IsDigit).ToArray());
            var pinMatches = await baseQuery
                .Where(p => p.PhilHealthNumber != null &&
                            (p.PhilHealthNumber == pinTrimmed ||
                             (!string.IsNullOrEmpty(pinDigits) && p.PhilHealthNumber.Replace("-", "").Contains(pinDigits))))
                .Take(20)
                .ToListAsync(ct);
            foreach (var p in pinMatches)
            {
                if (seen.Add(p.Id)) shortlist.Add(p);
            }
        }

        var customClaims = claims
            .Where(kv => !string.Equals(kv.Key, "patient_code", StringComparison.OrdinalIgnoreCase) &&
                         !string.Equals(kv.Key, "philhealth_pin", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (customClaims.Count > 0)
        {
            if (_dbContext.Database.IsNpgsql())
            {
                foreach (var (key, claimVal) in customClaims)
                {
                    var keyLower = key.Trim().ToLowerInvariant();
                    var valLower = claimVal.Trim().ToLowerInvariant();
                    var matched = await _dbContext.Patients
                        .FromSqlRaw(
                            """
                            SELECT p.*
                            FROM "Patients" p
                            WHERE NOT p."IsDeleted"
                              AND p."ClinicId" = {0}
                              AND p."CloudPatientId" IS NULL
                              AND p."CustomFields" IS NOT NULL
                              AND jsonb_typeof(p."CustomFields") = 'object'
                              AND EXISTS (
                                  SELECT 1
                                  FROM jsonb_each_text(p."CustomFields") AS kv(k, v)
                                  WHERE lower(kv.k) = {1}
                                    AND lower(btrim(kv.v)) = {2}
                              )
                            LIMIT 50
                            """,
                            clinicId,
                            keyLower,
                            valLower)
                        .IgnoreQueryFilters()
                        .AsNoTracking()
                        .ToListAsync(ct);

                    foreach (var p in matched)
                    {
                        if (seen.Add(p.Id)) shortlist.Add(p);
                    }
                }
            }
            else
            {
                var withCustomFields = await baseQuery
                    .Where(p => p.CustomFields != null)
                    .ToListAsync(ct);
                foreach (var p in withCustomFields)
                {
                    if (customClaims.Any(kv => MatchesCustomField(p, kv.Key, kv.Value)) && seen.Add(p.Id))
                    {
                        shortlist.Add(p);
                    }
                }
            }
        }

        var scored = new List<PatientLinkCandidateMatch>();
        foreach (var p in shortlist)
        {
            var score = 0;
            var signals = new List<string>();

            // Dynamic clinic-agnostic identifier claim matching against PatientCode, PhilHealthNumber, or CustomFields[key]
            foreach (var (key, claimVal) in claims)
            {
                if (string.Equals(key, "patient_code", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(p.PatientCode, claimVal, StringComparison.OrdinalIgnoreCase))
                {
                    score += 50;
                    signals.Add("Patient Code");
                }
                else if (string.Equals(key, "philhealth_pin", StringComparison.OrdinalIgnoreCase) &&
                         !string.IsNullOrWhiteSpace(p.PhilHealthNumber) &&
                         string.Equals(NormalizeDigits(p.PhilHealthNumber), NormalizeDigits(claimVal), StringComparison.Ordinal))
                {
                    score += 50;
                    signals.Add("PhilHealth PIN");
                }
                else if (MatchesCustomField(p, key, claimVal))
                {
                    score += 50;
                    signals.Add($"Custom Field ({key})");
                }
            }

            if (!string.IsNullOrEmpty(emailLower) &&
                string.Equals(p.Email?.Trim(), emailLower, StringComparison.OrdinalIgnoreCase))
            {
                score += 35;
                signals.Add("Verified Email");
            }

            var sameLast = string.Equals(p.LastName.Trim(), lastLower, StringComparison.OrdinalIgnoreCase);
            var sameFirst = string.Equals(p.FirstName.Trim(), firstLower, StringComparison.OrdinalIgnoreCase);
            if (sameLast && sameFirst && message.DateOfBirth.HasValue && p.DateOfBirth == message.DateOfBirth.Value)
            {
                score += 35;
                signals.Add("Full Name + DOB");
            }
            else if (sameLast && sameFirst)
            {
                score += 15;
                signals.Add("Full Name");
            }

            if (!string.IsNullOrEmpty(contactClean) && NormalizeDigits(p.ContactNumber) == contactClean)
            {
                score += 20;
                signals.Add("Contact Number");
            }

            if (score >= 15)
            {
                scored.Add(new PatientLinkCandidateMatch(
                    p.Id,
                    p.PatientCode,
                    $"{p.LastName}, {p.FirstName}",
                    p.DateOfBirth,
                    p.Email,
                    p.ContactNumber,
                    score,
                    signals));
            }
        }

        return scored
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.FullName)
            .Take(10)
            .ToList();
    }

    private static Dictionary<string, string> SanitizeClaims(Dictionary<string, string>? raw)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (raw is null) return result;
        foreach (var (k, v) in raw)
        {
            if (!string.IsNullOrWhiteSpace(k) && !string.IsNullOrWhiteSpace(v))
            {
                result[k.Trim()] = v.Trim();
            }
        }
        return result;
    }

    private static bool MatchesCustomField(Patient patient, string key, string claimValue)
    {
        if (patient.CustomFields is null) return false;
        foreach (var kv in patient.CustomFields)
        {
            if (!string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase)) continue;
            var val = kv.Value?.ToString()?.Trim();
            if (!string.IsNullOrWhiteSpace(val) && string.Equals(val, claimValue, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private static string NormalizeDigits(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var digits = new string(input.Where(char.IsDigit).ToArray());
        return digits.Length >= 10 ? digits[^10..] : digits;
    }
}
