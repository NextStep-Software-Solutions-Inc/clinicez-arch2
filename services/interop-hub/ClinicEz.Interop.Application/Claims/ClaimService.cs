using System.Security.Cryptography;
using System.Text;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Routing;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Claims;

/// <summary>
/// Patient-carried claims (plan 4.6): an issuing facility parks an order at the hub and hands the patient a token
/// (QR on the slip). The patient takes it to ANY facility of the right type, which redeems it exactly once
/// (<c>POST /v1/claims/{token}/redeem</c>). Redeeming
/// <list type="number">
/// <item>delivers the order to the redeemer's mailbox without any partner link or visibility check (the token is the authorization),</item>
/// <item>opens the correlation so the redeemer may reply to the issuer (<c>lab.order.claimed</c>, results, ...), and</item>
/// <item>purges the stored order; the claim row stays (hash only) until it expires so a second redeem is refused.</item>
/// </list>
/// The token is 256 random bits shown once; only its SHA-256 is stored.
/// </summary>
public sealed class ClaimService(
    OwnershipValidator ownership,
    EnvelopeSignatureVerifier signatures,
    RoutingPolicy routing,
    IDirectoryStore directory,
    IClaimStore claims,
    IEnvelopeProtector protector,
    IMailboxNotifier notifier,
    IOptions<HubOptions> options,
    TimeProvider time)
{
    public async Task<CreateClaimResponse> CreateAsync(HubPrincipal issuer, CreateClaimRequest? request, CancellationToken ct)
    {
        RequireFacilityClient(issuer);
        var envelope = request?.Envelope ?? throw HubRequestException.BadRequest("Envelope is required.");
        if (envelope.MessageId == Guid.Empty || string.IsNullOrWhiteSpace(envelope.Type) || envelope.From is null || envelope.To is null
            || envelope.Payload.ValueKind == System.Text.Json.JsonValueKind.Undefined)
            throw HubRequestException.BadRequest("Envelope needs MessageId, Type, From, To and Payload.");

        var ownershipError = await ownership.ValidateFromAsync(issuer, envelope.From, ct);
        if (ownershipError is not null) throw HubRequestException.Forbidden(ownershipError);

        var signatureError = await signatures.VerifyAsync(issuer, envelope, ct);
        if (signatureError is not null) throw HubRequestException.Forbidden(signatureError);

        if (envelope.To.Kind != PartyKind.Facility || envelope.To.FacilityType is null
            || !string.IsNullOrWhiteSpace(envelope.To.TenantId) || !string.IsNullOrWhiteSpace(envelope.To.FacilityId))
            throw HubRequestException.BadRequest("A claim envelope is addressed by facility type only: To.Kind=Facility, To.FacilityType set, no TenantId/FacilityId.");

        var opt = options.Value;
        var json = envelope.ToJson();
        if (Encoding.UTF8.GetByteCount(json) > opt.MaxEnvelopeBytes) throw HubRequestException.BadRequest("Envelope is too large.");

        var now = time.GetUtcNow().UtcDateTime;
        var ttlHours = Math.Clamp(request!.TtlHours ?? opt.Claims.DefaultTtlHours, 1, opt.Claims.MaxTtlHours);
        var token = SecretHasher.ToUrlSafe(RandomNumberGenerator.GetBytes(32));
        var claim = new HubClaim
        {
            Id = Guid.NewGuid(),
            TokenHash = Hash(token),
            CorrelationId = envelope.CorrelationId,
            MessageId = envelope.MessageId,
            IssuerTenantId = envelope.From.TenantId!,
            IssuerFacilityId = envelope.From.FacilityId!,
            TargetFacilityType = envelope.To.FacilityType,
            Envelope = protector.Protect(json),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddHours(ttlHours)
        };
        await claims.AddAsync(claim, ct);
        return new CreateClaimResponse(claim.Id, token, claim.ExpiresAtUtc);
    }

    public async Task<RedeemClaimResponse> RedeemAsync(HubPrincipal redeemer, string token, RedeemClaimRequest? request, CancellationToken ct)
    {
        RequireFacilityClient(redeemer);
        if (request is null || string.IsNullOrWhiteSpace(request.TenantId) || string.IsNullOrWhiteSpace(request.FacilityId))
            throw HubRequestException.BadRequest("TenantId and FacilityId are required.");

        var claim = await claims.FindByTokenHashAsync(Hash(token), ct) ?? throw HubRequestException.NotFound("Unknown claim token.");
        var now = time.GetUtcNow().UtcDateTime;
        if (claim.RedeemedAtUtc is not null) throw HubRequestException.Conflict("This claim was already redeemed.");
        if (claim.ExpiresAtUtc <= now) throw new HubRequestException(System.Net.HttpStatusCode.Gone, "This claim has expired.");

        var facility = await directory.GetFacilityAsync(request.TenantId, request.FacilityId, ct);
        if (facility is not { Active: true } || facility.CellId != redeemer.CellId)
            throw HubRequestException.Forbidden("The redeeming facility is not an active facility of this client's cell.");
        if (claim.TargetFacilityType is { } expected && facility.FacilityType != expected)
            throw new HubRequestException(System.Net.HttpStatusCode.UnprocessableEntity, $"This claim can only be redeemed by a {expected}.");

        var original = InteropEnvelope.FromJson(protector.Unprotect(claim.Envelope));
        var (mailbox, reason) = await routing.ResolveMailboxAsync(facility, original.To.Service, ct);
        if (mailbox is null) throw HubRequestException.BadRequest(reason ?? "Cannot resolve the redeemer's mailbox.");

        var delivered = original with
        {
            SignedTo = original.SignedTo ?? original.To,
            To = Party.ForFacility(facility.TenantId, facility.FacilityId, facility.FacilityType, original.To.Service)
        };
        var json = delivered.ToJson();
        var message = new HubMessage
        {
            MessageId = delivered.MessageId,
            CorrelationId = delivered.CorrelationId,
            Mailbox = mailbox,
            Type = delivered.Type,
            Envelope = protector.Protect(json),
            SizeBytes = Encoding.UTF8.GetByteCount(json),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(options.Value.MessageTtlDays),
            VisibleAfterUtc = now
        };
        var conversation = new ConversationEntry(
            claim.CorrelationId,
            HubFacility.MakeKey(claim.IssuerTenantId, claim.IssuerFacilityId),
            facility.Key);

        if (!await claims.TryRedeemAsync(claim, facility.TenantId, facility.FacilityId, message, conversation, ct))
            throw HubRequestException.Conflict("This claim was already redeemed.");

        notifier.Notify(mailbox);
        return new RedeemClaimResponse(claim.Id, claim.CorrelationId, claim.MessageId, delivered.Type, claim.IssuerTenantId, claim.IssuerFacilityId);
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static void RequireFacilityClient(HubPrincipal client)
    {
        if (client.Kind is not (HubClientKind.CloudService or HubClientKind.EdgeCell))
            throw HubRequestException.Forbidden("Only facility clients can create or redeem claims.");
    }
}
