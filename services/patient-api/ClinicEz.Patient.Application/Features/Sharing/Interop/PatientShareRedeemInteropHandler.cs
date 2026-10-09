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
/// Redeems the signed token a patient shows as a QR code: checks signature, expiry and single use, records a grant for the
/// redeeming facility, and answers that facility with a snapshot limited to the scopes the patient chose. Every failure is
/// answered with a denied snapshot rather than silence, so the facility can tell the patient what to do. Only a
/// facility that can be answered (tenant, facility id and a service route) is served at all.
/// </summary>
public sealed class PatientShareRedeemInteropHandler : IInteropHandler<PatientShareRedeemPayload>
{
    private const string TokenNotValid = "The share code is not valid. Ask the patient to show a fresh code.";
    private const string TokenExpired = "The share code has expired. Ask the patient to show a fresh code.";
    private const string TokenUsed = "The share code was already used. Ask the patient to show a fresh code.";
    private const string PatientUnknown = "The patient could not be found.";

    private static readonly Party ControlPlanePatient = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

    private readonly IShareTokenService _tokens;
    private readonly IPatientRepository _patients;
    private readonly IPatientAccessRepository _access;
    private readonly PatientShareSnapshotBuilder _snapshots;
    private readonly IInteropPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SharingOptions _options;
    private readonly TimeProvider _time;
    private readonly ILogger<PatientShareRedeemInteropHandler> _logger;

    public PatientShareRedeemInteropHandler(
        IShareTokenService tokens,
        IPatientRepository patients,
        IPatientAccessRepository access,
        PatientShareSnapshotBuilder snapshots,
        IInteropPublisher publisher,
        IUnitOfWork unitOfWork,
        IOptions<SharingOptions> options,
        TimeProvider time,
        ILogger<PatientShareRedeemInteropHandler> logger)
    {
        _tokens = tokens;
        _patients = patients;
        _access = access;
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

        var validation = _tokens.Validate(payload.ShareToken);
        if (!validation.IsValid || validation.Claims is not { } claims)
        {
            Reply(context, Guid.Empty, ControlPlanePatient, Denied(validation.Failure == ShareTokenFailure.Expired ? TokenExpired : TokenNotValid, Guid.Empty));
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        var patient = await _patients.GetByIdAsync(claims.PatientId, ct);
        if (patient is null)
        {
            Reply(context, Guid.Empty, ControlPlanePatient, Denied(PatientUnknown, claims.PatientId));
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        var sender = Party.ForPatient(patient.Id.ToString());
        var previous = await _access.GetTokenUseAsync(claims.TokenId, ct);
        if (previous is not null)
        {
            await ReplyToPreviousUseAsync(previous, patient, claims, context, sender, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        var now = _time.GetUtcNow().UtcDateTime;
        var grant = new PatientAccessGrant
        {
            PatientId = patient.Id,
            TenantId = requester.TenantId!,
            FacilityId = facilityId,
            ScopesMask = (int)claims.Scopes,
            Purpose = claims.Purpose,
            ExpiresAt = now.AddHours(_options.QrGrantHours),
            Source = AccessGrantSource.Qr
        };
        await _access.AddGrantAsync(grant, ct);
        await _access.AddTokenUseAsync(new ShareTokenUse
        {
            TokenId = claims.TokenId,
            PatientId = patient.Id,
            GrantId = grant.Id,
            MessageId = context.MessageId
        }, ct);
        await _access.AddLogAsync(new PatientAccessLog
        {
            PatientId = patient.Id,
            GrantId = grant.Id,
            Actor = requester.Address,
            Action = "Redeemed",
            Detail = $"Shared: {string.Join(", ", SharingScopeMap.ToNames(claims.Scopes))}"
        }, ct);

        Reply(context, patient.Id, sender, await GrantedAsync(patient, grant, claims.Scopes, ct));
        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task ReplyToPreviousUseAsync(
        ShareTokenUse previous, Domain.Entities.Patient patient, ShareTokenClaims claims,
        InteropMessageContext context, Party sender, CancellationToken ct)
    {
        var grant = previous.MessageId == context.MessageId
            ? (await _access.GetGrantsAsync(patient.Id, ct)).FirstOrDefault(g => g.Id == previous.GrantId)
            : null;

        if (grant is null)
        {
            Reply(context, patient.Id, sender, Denied(TokenUsed, patient.Id));
            return;
        }

        Reply(context, patient.Id, sender, await GrantedAsync(patient, grant, claims.Scopes, ct));
    }

    private async Task<PatientShareSnapshotPayload> GrantedAsync(
        Domain.Entities.Patient patient, PatientAccessGrant grant, SharingScopes scopes, CancellationToken ct)
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
            Demographics = content?.Demographics,
            Items = content?.Items ?? []
        };
    }

    private static PatientShareSnapshotPayload Denied(string reason, Guid patientId) => new()
    {
        Granted = false,
        DenialReason = reason,
        PatientId = patientId
    };

    private void Reply(InteropMessageContext context, Guid patientId, Party sender, PatientShareSnapshotPayload snapshot) =>
        _publisher.Enqueue(InteropEnvelope.Create(
            InteropTypes.PatientShareSnapshot, patientId == Guid.Empty ? ControlPlanePatient : sender, context.From,
            context.CorrelationId, snapshot));

    private static bool IsAnswerable(Party party, out Guid facilityId)
    {
        facilityId = Guid.Empty;
        return party.Kind == PartyKind.Facility
            && !string.IsNullOrWhiteSpace(party.TenantId)
            && Guid.TryParse(party.FacilityId, out facilityId)
            && (party.Service is not null || party.FacilityType is not null);
    }
}
