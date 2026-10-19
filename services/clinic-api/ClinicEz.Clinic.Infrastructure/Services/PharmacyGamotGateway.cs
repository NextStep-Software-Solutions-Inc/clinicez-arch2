using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Asks the pharmacy for GAMOT reference data through the interop hub (<c>gamot.lookup.requested</c>, answered with
/// <c>gamot.lookup.responded</c>); there is no direct HTTP call to the pharmacy. The pharmacy is the facility named by
/// <c>Gamot:PharmacyFacilityId</c> in this clinic's own tenant. When it is not set, the clinic is not provisioned, or the
/// pharmacy does not answer in time, the caller gets a 503/504 with the usual error body.
/// </summary>
public sealed class PharmacyGamotGateway : IPharmacyGamotGateway
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(45);

    private readonly IInteropRequestClient _requests;
    private readonly IClinicIdentityProvider _identity;
    private readonly ILogger<PharmacyGamotGateway> _logger;
    private readonly string? _pharmacyFacilityId;

    public PharmacyGamotGateway(
        IInteropRequestClient requests,
        IClinicIdentityProvider identity,
        IConfiguration configuration,
        ILogger<PharmacyGamotGateway> logger)
    {
        _requests = requests;
        _identity = identity;
        _logger = logger;
        _pharmacyFacilityId = NullIfBlank(configuration["Gamot:PharmacyFacilityId"]);
    }

    public async Task<GamotGatewayResult> SendAsync(
        string method,
        string relativePath,
        string queryString,
        string? jsonBody,
        CancellationToken ct)
    {
        if (_pharmacyFacilityId is null)
        {
            return Failure(503, "GAMOT is not available: no pharmacy is configured for this clinic. Set Gamot:PharmacyFacilityId.");
        }

        var clinic = await _identity.GetAsync(ct);
        if (clinic is null)
        {
            return Failure(503, "GAMOT is not available: this clinic has not been provisioned on this server.");
        }

        var request = new GamotLookupRequestedPayload
        {
            Method = method.ToUpperInvariant(),
            Path = relativePath.TrimStart('/'),
            Query = NullIfBlank(queryString.TrimStart('?')),
            Body = jsonBody
        };

        try
        {
            var reply = await _requests.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
                InteropTypes.GamotLookupRequested,
                InteropTypes.GamotLookupResponded,
                ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
                ClinicParties.Target(clinic.TenantId, _pharmacyFacilityId, FacilityType.Pharmacy, "pharmacy"),
                request,
                Timeout,
                ct);
            return new GamotGatewayResult(reply.StatusCode, reply.ContentType, reply.Body ?? string.Empty);
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogWarning(ex, "GAMOT request to the pharmacy timed out ({Method} {Path}).", method, relativePath);
            return Failure(504, "The pharmacy did not answer in time. Try again in a moment.");
        }
    }

    private static GamotGatewayResult Failure(int statusCode, string message) =>
        new(statusCode, "application/json",
            JsonSerializer.Serialize(new { succeeded = false, message, errors = Array.Empty<string>() }));

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
