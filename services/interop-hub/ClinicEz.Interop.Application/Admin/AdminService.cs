using System.Security.Cryptography;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Directory;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Admin;

/// <summary>
/// Backs <see cref="IHubAdminClient"/> (ControlPlane only): onboard cells and issue, rotate and revoke client credentials.
/// Secrets are generated here, returned exactly once and stored only as a salted PBKDF2 hash. Each client also gets an ECDSA P-256\n/// signing key pair for envelope signatures: the hub keeps the public key and returns the private key exactly once (or registers a\n/// public key the caller supplies at creation).
/// </summary>
public sealed class AdminService(
    IClientStore clients,
    IDirectoryStore directoryStore,
    DirectoryService directory,
    ClientAuthenticator authenticator,
    ClientKeyDirectory keyDirectory,
    IOptions<HubOptions> options,
    TimeProvider time)
{
    public async Task UpsertCellAsync(string cellId, DirectoryCellUpsertedPayload cell, CancellationToken ct)
    {
        var error = await directory.UpsertCellAsync(cell with { CellId = cellId }, ct);
        if (error is not null) throw HubRequestException.BadRequest(error);
    }

    public async Task<HubClientCredentials> CreateClientAsync(string cellId, CreateHubClientRequest request, CancellationToken ct)
    {
        if (!MailboxNames.IsValidService(request.Service))
            throw HubRequestException.BadRequest("Service must be lowercase letters, digits or '-' (max 32) and not reserved.");

        var cell = await directoryStore.GetCellAsync(cellId, ct) ?? throw HubRequestException.NotFound($"Cell '{cellId}' does not exist.");
        if (!cell.Active) throw HubRequestException.Conflict($"Cell '{cellId}' is inactive.");

        var edgeClient = request.Kind == HubClientKind.EdgeCell;
        if (edgeClient != (cell.Kind == CellKind.Edge))
            throw HubRequestException.BadRequest(edgeClient
                ? "EdgeCell clients belong to an edge cell."
                : "Only EdgeCell clients can belong to an edge cell.");

        var secret = SecretHasher.GenerateSecret();
        var (publicKey, signingKey) = request.PublicKey is null ? NewSigningKey() : (RegisterPublicKey(request.PublicKey), null);
        var client = new HubClient
        {
            ClientId = $"{cellId}.{request.Service}.{Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant()}",
            CellId = cellId,
            Service = request.Service,
            Kind = request.Kind,
            SecretHash = SecretHasher.Hash(secret, options.Value.Auth.Pbkdf2Iterations),
            PublicKeyPem = publicKey,
            CreatedAtUtc = time.GetUtcNow().UtcDateTime
        };
        await clients.AddAsync(client, ct);
        return new HubClientCredentials(client.ClientId, secret, client.CellId, client.Service, client.Kind, signingKey);
    }

    public async Task<HubClientCredentials> RotateClientAsync(string clientId, CancellationToken ct)
    {
        var client = await clients.FindAsync(clientId, ct) ?? throw HubRequestException.NotFound($"Client '{clientId}' does not exist.");
        if (client.Revoked) throw HubRequestException.Conflict($"Client '{clientId}' is revoked.");

        var secret = SecretHasher.GenerateSecret();
        var (publicKey, signingKey) = NewSigningKey();
        client.SecretHash = SecretHasher.Hash(secret, options.Value.Auth.Pbkdf2Iterations);
        client.PublicKeyPem = publicKey;
        client.SecretRotatedAtUtc = time.GetUtcNow().UtcDateTime;
        await clients.UpdateAsync(client, ct);
        authenticator.Invalidate(clientId);
        keyDirectory.Invalidate(clientId);
        return new HubClientCredentials(client.ClientId, secret, client.CellId, client.Service, client.Kind, signingKey);
    }

    public async Task RevokeClientAsync(string clientId, CancellationToken ct)
    {
        var client = await clients.FindAsync(clientId, ct) ?? throw HubRequestException.NotFound($"Client '{clientId}' does not exist.");
        if (!client.Revoked)
        {
            client.Revoked = true;
            client.RevokedAtUtc = time.GetUtcNow().UtcDateTime;
            await clients.UpdateAsync(client, ct);
        }

        authenticator.Invalidate(clientId);
        keyDirectory.Invalidate(clientId);
    }

    /// <summary>A fresh key pair: the public PEM to store, and the private key as base64 of PEM to hand out once.</summary>
    private static (string PublicKeyPem, string SigningKey) NewSigningKey()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return (ecdsa.ExportSubjectPublicKeyInfoPem(), PemKey.ToBase64(ecdsa.ExportECPrivateKeyPem()));
    }

    /// <summary>Validates a caller-supplied public key and returns its canonical PEM.</summary>
    internal static string RegisterPublicKey(string value)
    {
        try
        {
            var pem = PemKey.Normalize(value, "PublicKey")!;
            if (pem.Contains("PRIVATE", StringComparison.Ordinal))
                throw HubRequestException.BadRequest("PublicKey must be a public key; never send a private key to the hub.");
            using var ecdsa = PemKey.ImportEcdsa(pem, "PublicKey");
            return ecdsa.ExportSubjectPublicKeyInfoPem();
        }
        catch (InvalidOperationException ex)
        {
            throw HubRequestException.BadRequest(ex.Message);
        }
    }
}
