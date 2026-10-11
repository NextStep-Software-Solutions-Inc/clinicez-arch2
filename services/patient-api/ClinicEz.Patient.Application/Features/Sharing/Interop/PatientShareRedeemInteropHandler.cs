using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing.Interop;

/// <summary>
/// Redeems what a patient shares: the signed token shown as a QR (checks signature, expiry and how many redemptions are
/// left) or a one-time code typed with the patient's ClinicEzId (throttled against guessing). Every redemption records or
/// refreshes a grant for the redeeming facility, writes an access-log entry and answers that facility with a fresh snapshot
/// limited to the scopes the patient chose. A repeat redemption by the same facility refreshes its grant; a revoked grant
/// stays revoked. Every failure is answered with a denied snapshot rather than silence, so the facility can tell the patient
/// what to do. Only a facility that can be answered (tenant, facility id and a service route) is served at all. Two
/// concurrent redemptions cannot both take the last slot: each takes the next sequence number and the database rejects a
/// duplicate, which makes the losing delivery retry and find the token used up.
/// </summary>
public sealed class PatientShareRedeemInteropHandler : IInteropHandler<PatientShareRedeemPayload>
{
    private const string TokenNotValid = "The share code is not valid. Ask the patient to show a fresh code.";
    private const string TokenExpired = "The share code has expired. Ask the patient to show a fresh code.";
    private const string TokenUsed = "The share code was already used. Ask the patient to show a fresh code.";
    private const string CodeNotValid = "The patient ID or code is not valid. Check both with the patient.";
    private const string TooManyAttempts = "Too many wrong codes were tried. Wait a few minutes and ask the patient for a new code.";
    private const string AccessRevoked = "The patient has revoked this facility's access. Ask them to share again.";
    private const string PatientUnknown = "The patient could not be found.";

    private static readonly Party ControlPlanePatient = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

    private readonly IShareTokenService _tokens;
    private readonly IShareCodeService _codeService;
    private readonly IPatientRepository _patients;
    private readonly IPatientAccessRepository _access;
    private readonly IShareCodeRepository _codes;
    private readonly PatientShareSnapshotBuilder _snapshots;
    private readonly IInteropPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SharingOptions _options;
    private readonly TimeProvider _time;
    private readonly ILogger<PatientShareRedeemInteropHandler> _logger;

    public PatientShareRedeemInteropHandler(
        IShareTokenService tokens,
        IShareCodeService codeService,
        IPatientRepository patients,
        IPatientAccessRepository access,
        IShareCodeRepository codes,
        PatientShareSnapshotBuilder snapshots,
        IInteropPublisher publisher,
        IUnitOfWork unitOfWork,
        IOptions<SharingOptions> options,
        TimeProvider time,
        ILogger<PatientShareRedeemInteropHandler> logger)
    {
        _tokens = tokens;
        _codeService = codeService;
        _patients = patients;
        _access = access;
        _codes = codes;
        _snapshots = snapshots;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
        _options = options.Value;
        _time = time;
        _logger = logger;
    }

    public async Task HandleAsync(PatientShareRedeemPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var requester = context.From;
        if (!IsAnswerable(requester, out var facilityId))
        {
            _logger.LogWarning(
                "Ignoring patient.share.redeem {MessageId}: sender {Sender} is not a facility that can be answered.",
                context.MessageId, requester.Address);
            return;
        }

        var viaCode = string.IsNullOrWhiteSpace(payload.ShareToken);
        var (claims, denial) = viaCode
            ? await ResolveCodeAsync(payload, requester, ct)
            : ResolveToken(payload.ShareToken);

        if (claims is null)
        {
            Reply(context, denial!);
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        var patient = await _patients.GetByIdAsync(claims.PatientId, ct);
        if (patient is null)
        {
            Reply(context, Denied(PatientUnknown, ShareDenialCode.PatientUnknown, Guid.Empty));
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        await RedeemAsync(patient, claims, viaCode, requester, facilityId, context, ct);
        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task RedeemAsync(
        Domain.Entities.Patient patient, ShareTokenClaims claims, bool viaCode, Party requester, Guid facilityId,
        InteropMessageContext context, CancellationToken ct)
    {
        var now = _time.GetUtcNow().UtcDateTime;
        var uses = await _access.GetTokenUsesAsync(claims.TokenId, ct);

        var delivered = uses.FirstOrDefault(u => u.MessageId == context.MessageId);
        if (delivered is not null)
        {
            await ReplyToRedeliveryAsync(patient, claims, delivered, uses, facilityId, context, ct);
            return;
        }

        if (uses.Count >= claims.MaxRedemptions)
        {
            var reason = claims.MaxRedemptions == 1
                ? TokenUsed
                : $"The share code was already used {claims.MaxRedemptions} times. Ask the patient to show a fresh code.";
            Reply(context, Denied(reason, ShareDenialCode.Exhausted, patient.Id));
            return;
        }

        var prior = uses.FirstOrDefault(u => u.FacilityId == facilityId);
        PatientAccessGrant grant;
        if (prior is null)
        {
            grant = new PatientAccessGrant
            {
                PatientId = patient.Id,
                TenantId = requester.TenantId!,
                FacilityId = facilityId,
                Scopes = (AccessScopes)(int)claims.Scopes,
                Purpose = claims.Purpose,
                ExpiresAt = now.AddHours(_options.QrGrantHours),
                Source = viaCode ? AccessGrantSource.Manual : AccessGrantSource.Qr
            };
            await _access.AddGrantAsync(grant, ct);
        }
        else
        {
            var existing = await _access.GetGrantAsync(patient.Id, prior.GrantId, ct);
            if (existing is null || !existing.IsActiveAt(now))
            {
                Reply(context, Denied(AccessRevoked, ShareDenialCode.Revoked, patient.Id));
                return;
            }

            grant = existing;
        }

        var sequence = uses.Count + 1;
        await _access.AddTokenUseAsync(new ShareTokenUse
        {
            TokenId = claims.TokenId,
            PatientId = patient.Id,
            GrantId = grant.Id,
            FacilityId = facilityId,
            Sequence = sequence,
            MessageId = context.MessageId
        }, ct);
        await _access.AddLogAsync(new PatientAccessLog
        {
            PatientId = patient.Id,
            GrantId = grant.Id,
            Actor = requester.Address,
            Action = prior is null ? "Redeemed" : "Refreshed",
            Detail = LogDetail(claims, viaCode, sequence)
        }, ct);

        Reply(context, await GrantedAsync(patient, grant, claims.Scopes, sequence, claims.MaxRedemptions, prior is not null, ct));
    }

    private async Task ReplyToRedeliveryAsync(
        Domain.Entities.Patient patient, ShareTokenClaims claims, ShareTokenUse delivered, IReadOnlyList<ShareTokenUse> uses,
        Guid facilityId, InteropMessageContext context, CancellationToken ct)
    {
        var grant = await _access.GetGrantAsync(patient.Id, delivered.GrantId, ct);
        if (grant is null)
        {
            Reply(context, Denied(TokenUsed, ShareDenialCode.Exhausted, patient.Id));
            return;
        }

        var isRefresh = uses.Any(u => u.FacilityId == facilityId && u.Sequence < delivered.Sequence);
        Reply(context, await GrantedAsync(patient, grant, claims.Scopes, delivered.Sequence, claims.MaxRedemptions, isRefresh, ct));
    }

    private (ShareTokenClaims? Claims, PatientShareSnapshotPayload? Denial) ResolveToken(string token)
    {
        var validation = _tokens.Validate(token);
        if (validation.IsValid && validation.Claims is { } claims)
            return (claims, null);

        return validation.Failure == ShareTokenFailure.Expired
            ? (null, Denied(TokenExpired, ShareDenialCode.Expired, Guid.Empty))
            : (null, Denied(TokenNotValid, ShareDenialCode.Invalid, Guid.Empty));
    }

    private async Task<(ShareTokenClaims? Claims, PatientShareSnapshotPayload? Denial)> ResolveCodeAsync(
        PatientShareRedeemPayload payload, Party requester, CancellationToken ct)
    {
        var now = _time.GetUtcNow().UtcDateTime;
        var since = now.AddMinutes(-_options.ShareCodeFailureWindowMinutes);
        var rateLimited = (null as ShareTokenClaims, Denied(TooManyAttempts, ShareDenialCode.RateLimited, Guid.Empty));

        if (await _codes.CountFailuresByActorAsync(requester.Address, since, ct) >= _options.MaxShareCodeFailuresPerFacility)
            return rateLimited;

        var clinicEzId = payload.ClinicEzId?.Trim().ToUpperInvariant();
        var patient = string.IsNullOrEmpty(clinicEzId) ? null : await _patients.GetByClinicEzIdAsync(clinicEzId, ct);
        if (patient is not null && await _codes.CountFailuresByPatientAsync(patient.Id, since, ct) >= _options.MaxShareCodeFailuresPerPatient)
            return rateLimited;

        var normalized = _codeService.Normalize(payload.Code);
        var code = patient is null || normalized is null
            ? null
            : await _codes.FindAsync(patient.Id, _codeService.Hash(patient.Id, normalized), ct);

        if (code is null)
        {
            await _codes.AddFailureAsync(new ShareCodeFailure { PatientId = patient?.Id, Actor = requester.Address }, ct);
            return (null, Denied(CodeNotValid, ShareDenialCode.Invalid, Guid.Empty));
        }

        if (code.ExpiresAt <= now)
            return (null, Denied(TokenExpired, ShareDenialCode.Expired, Guid.Empty));

        return (new ShareTokenClaims(code.TokenId, code.PatientId, (SharingScopes)(int)code.Scopes, code.Purpose, code.ExpiresAt, 1), null);
    }

    private async Task<PatientShareSnapshotPayload> GrantedAsync(
        Domain.Entities.Patient patient, PatientAccessGrant grant, SharingScopes scopes, int sequence, int maxRedemptions,
        bool isRefresh, CancellationToken ct)
    {
        var content = await _snapshots.BuildAsync(patient.Id, scopes, ct);
        return new PatientShareSnapshotPayload
        {
            Granted = true,
            GrantId = grant.Id,
            PatientId = patient.Id,
            ClinicEzId = patient.ClinicEzId,
            Scopes = scopes,
            ExpiresAtUtc = grant.ExpiresAt,
            RedemptionNumber = sequence,
            MaxRedemptions = maxRedemptions,
            IsRefresh = isRefresh,
            Demographics = content?.Demographics,
            Items = content?.Items ?? []
        };
    }

    private static string LogDetail(ShareTokenClaims claims, bool viaCode, int sequence)
    {
        var detail = $"Shared{(viaCode ? " by code" : string.Empty)}: {string.Join(", ", SharingScopeMap.ToNames(claims.Scopes))}";
        return claims.MaxRedemptions > 1 ? $"{detail} (use {sequence} of {claims.MaxRedemptions})" : detail;
    }

    private static PatientShareSnapshotPayload Denied(string reason, ShareDenialCode code, Guid patientId) => new()
    {
        Granted = false,
        DenialReason = reason,
        DenialCode = code,
        PatientId = patientId
    };

    private void Reply(InteropMessageContext context, PatientShareSnapshotPayload snapshot) =>
        _publisher.Enqueue(InteropEnvelope.Create(
            InteropTypes.PatientShareSnapshot,
            snapshot.PatientId == Guid.Empty ? ControlPlanePatient : Party.ForPatient(snapshot.PatientId.ToString()),
            context.From, context.CorrelationId, snapshot));

    private static bool IsAnswerable(Party party, out Guid facilityId)
    {
        facilityId = Guid.Empty;
        return party.Kind == PartyKind.Facility
            && !string.IsNullOrWhiteSpace(party.TenantId)
            && Guid.TryParse(party.FacilityId, out facilityId)
            && (party.Service is not null || party.FacilityType is not null);
    }
}
