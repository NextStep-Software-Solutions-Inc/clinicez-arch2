using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Admin;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Bootstrap;

/// <summary>
/// Applies <c>Hub:Bootstrap</c> (cells, clients, seed facilities) idempotently at startup. This is how the very first
/// ControlPlane client of a production hub is created: set <c>Hub__Bootstrap__Clients__0__*</c> in the environment (a secret
/// of at least <see cref="AuthOptions.MinBootstrapSecretLength"/> characters outside Development). The config is declarative:
/// a changed secret re-hashes the stored client; a client revoked through the admin API stays revoked.
/// A production cloud hub refuses to start when it ends up with no active ControlPlane client.
/// </summary>
public sealed class HubBootstrapper(
    IClientStore clients,
    IDirectoryStore directory,
    IOptions<HubOptions> options,
    TimeProvider time,
    ILogger<HubBootstrapper> logger)
{
    public async Task ApplyAsync(bool isDevelopment, CancellationToken ct)
    {
        var opt = options.Value;
        var bootstrap = opt.Bootstrap;

        if (bootstrap is not null)
        {
            foreach (var cell in bootstrap.Cells)
            {
                if (string.IsNullOrWhiteSpace(cell.CellId) || cell.CellId.Contains(':'))
                    throw new InvalidOperationException("Hub:Bootstrap:Cells: CellId is required and must not contain ':'.");
                await directory.UpsertCellAsync(
                    new DirectoryCellUpsertedPayload { CellId = cell.CellId, Name = cell.Name, Kind = cell.Kind, TenantId = cell.TenantId, Active = true }, ct);
            }

            foreach (var facility in bootstrap.Facilities)
            {
                await directory.UpsertFacilityAsync(new DirectoryFacilityUpsertedPayload
                {
                    TenantId = facility.TenantId,
                    FacilityId = facility.FacilityId,
                    FacilityType = facility.FacilityType,
                    CellId = facility.CellId,
                    DisplayName = facility.DisplayName,
                    City = facility.City,
                    Visibility = facility.Visibility,
                    AcceptsExternalRequests = facility.AcceptsExternalRequests,
                    Active = true
                }, ct);
            }

            foreach (var configured in bootstrap.Clients)
                await ApplyClientAsync(configured, isDevelopment, ct);
        }

        if (!isDevelopment && opt.UpstreamActive && opt.Signing.Required == true && string.IsNullOrWhiteSpace(opt.Upstream.SigningKey))
            throw new InvalidOperationException("Hub:Upstream:SigningKey is required: the cloud hub rejects unsigned messages, and a local hub re-signs everything it forwards with the key the portal issued for this edge cell.");

        if (!isDevelopment && !opt.IsLocal && !await clients.AnyActiveAsync(HubClientKind.ControlPlane, ct))
            throw new InvalidOperationException(
                "The hub has no active ControlPlane client, so nothing could manage it. Create the first one by setting " +
                "Hub__Bootstrap__Cells__0__* (the cloud cell) and Hub__Bootstrap__Clients__0__* (Kind=ControlPlane, Service=portal, a strong Secret) in the environment.");
    }

    private async Task ApplyClientAsync(BootstrapClient configured, bool isDevelopment, CancellationToken ct)
    {
        var opt = options.Value;
        if (string.IsNullOrWhiteSpace(configured.ClientId) || string.IsNullOrEmpty(configured.Secret))
            throw new InvalidOperationException("Hub:Bootstrap:Clients: ClientId and Secret are required.");
        if (!isDevelopment && configured.Secret.Length < opt.Auth.MinBootstrapSecretLength)
            throw new InvalidOperationException(
                $"Hub:Bootstrap client '{configured.ClientId}': the secret must be at least {opt.Auth.MinBootstrapSecretLength} characters outside Development.");
        if (!MailboxNames.IsValidService(configured.Service))
            throw new InvalidOperationException($"Hub:Bootstrap client '{configured.ClientId}': invalid Service '{configured.Service}'.");
        if ((configured.Kind == HubClientKind.PlatformService) != InteropServices.IsPlatformService(configured.Service))
            throw new InvalidOperationException($"Hub:Bootstrap client '{configured.ClientId}': Kind=PlatformService is for exactly the platform services ({string.Join(", ", InteropServices.PlatformServices)}) and only they may use those service names.");
        if (configured.Kind == HubClientKind.PlatformService && opt.IsLocal)
            throw new InvalidOperationException($"Hub:Bootstrap client '{configured.ClientId}': platform services run in the cloud cell, not behind a local hub.");
        var publicKey = string.IsNullOrWhiteSpace(configured.PublicKey) ? null : AdminService.RegisterPublicKey(configured.PublicKey);
        if (publicKey is null && !isDevelopment && opt.Signing.Required == true)
            throw new InvalidOperationException($"Hub:Bootstrap client '{configured.ClientId}': PublicKey is required (the ECDSA P-256 public key matching the service's Messaging:SigningKey) because envelope signing is required.");
        if (await directory.GetCellAsync(configured.CellId, ct) is null)
            throw new InvalidOperationException($"Hub:Bootstrap client '{configured.ClientId}': cell '{configured.CellId}' is not defined (add it to Hub:Bootstrap:Cells).");

        var existing = await clients.FindAsync(configured.ClientId, ct);
        if (existing is null)
        {
            await clients.AddAsync(new HubClient
            {
                ClientId = configured.ClientId,
                CellId = configured.CellId,
                Service = configured.Service,
                Kind = configured.Kind,
                SecretHash = SecretHasher.Hash(configured.Secret, opt.Auth.Pbkdf2Iterations),
                PublicKeyPem = publicKey,
                CreatedAtUtc = time.GetUtcNow().UtcDateTime
            }, ct);
            logger.LogInformation("Bootstrapped hub client {ClientId} ({Kind}, cell {CellId}, service {Service})", configured.ClientId, configured.Kind, configured.CellId, configured.Service);
            return;
        }

        if (existing.Revoked)
        {
            logger.LogWarning("Hub client {ClientId} is revoked; Hub:Bootstrap does not resurrect it.", configured.ClientId);
            return;
        }

        var changed = existing.CellId != configured.CellId || existing.Service != configured.Service || existing.Kind != configured.Kind;
        existing.CellId = configured.CellId;
        existing.Service = configured.Service;
        existing.Kind = configured.Kind;
        if (publicKey is not null && existing.PublicKeyPem != publicKey)
        {
            existing.PublicKeyPem = publicKey;
            changed = true;
        }

        if (!SecretHasher.Verify(configured.Secret, existing.SecretHash))
        {
            existing.SecretHash = SecretHasher.Hash(configured.Secret, opt.Auth.Pbkdf2Iterations);
            existing.SecretRotatedAtUtc = time.GetUtcNow().UtcDateTime;
            changed = true;
        }

        if (changed) await clients.UpdateAsync(existing, ct);
    }
}
