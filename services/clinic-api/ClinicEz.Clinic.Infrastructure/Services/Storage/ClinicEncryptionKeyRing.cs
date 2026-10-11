using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

/// <summary>
/// The clinic's encryption master secrets. There is deliberately no compiled-in secret: the current secret must be
/// configured, and the service refuses to start without it.
///
/// Key rotation (record attachments stay readable throughout, nothing is re-encrypted in place):
///   1. Generate a new secret, e.g. <c>openssl rand -base64 48</c> (at least <see cref="MinSecretLength"/> characters).
///   2. Move the value of <c>ClinicEncryption__MasterSecret</c> into <c>ClinicEncryption__PreviousMasterSecrets__0</c>
///      (append further retired secrets as <c>__1</c>, <c>__2</c>, ...), then set <c>ClinicEncryption__MasterSecret</c> to the new secret.
///   3. Restart the service. New files are wrapped with the new secret; each stored wrapped key records the id of the
///      secret that produced it, so older files are decrypted with the matching previous secret.
///   4. A retired secret may only be removed once no stored file was wrapped with it. Losing a secret makes the files
///      wrapped with it permanently unreadable.
/// Files wrapped before key ids existed carry no id; they are tried against every configured secret.
/// </summary>
public sealed class ClinicEncryptionKeyRing
{
    public const string MasterSecretKey = "ClinicEncryption:MasterSecret";
    public const string PreviousMasterSecretsKey = "ClinicEncryption:PreviousMasterSecrets";
    public const int MinSecretLength = 32;

    private readonly IReadOnlyList<Entry> _entries;

    private ClinicEncryptionKeyRing(IReadOnlyList<Entry> entries)
    {
        _entries = entries;
    }

    /// <summary>The key used to wrap newly encrypted files.</summary>
    public (string KeyId, byte[] Secret) Current => (_entries[0].KeyId, _entries[0].Secret);

    /// <summary>Every key that may decrypt, the key identified by <paramref name="keyId"/> only when one is given.</summary>
    public IEnumerable<byte[]> CandidatesFor(string? keyId) =>
        string.IsNullOrEmpty(keyId)
            ? _entries.Select(e => e.Secret)
            : _entries.Where(e => e.KeyId == keyId).Select(e => e.Secret);

    /// <summary>Reads the ring from configuration; throws when the current secret is missing or too short.</summary>
    public static ClinicEncryptionKeyRing FromConfiguration(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var current = configuration[MasterSecretKey];
        if (string.IsNullOrWhiteSpace(current))
            throw new InvalidOperationException(
                $"'{MasterSecretKey}' is not configured. Set the ClinicEncryption__MasterSecret environment variable to a random secret of at least {MinSecretLength} characters.");

        var secrets = new List<string> { current };
        secrets.AddRange(configuration.GetSection(PreviousMasterSecretsKey).GetChildren()
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))!);

        if (secrets.Any(s => s.Length < MinSecretLength))
            throw new InvalidOperationException(
                $"Every clinic encryption secret ('{MasterSecretKey}' and '{PreviousMasterSecretsKey}') must be at least {MinSecretLength} characters.");

        return new ClinicEncryptionKeyRing(secrets
            .Distinct(StringComparer.Ordinal)
            .Select(s =>
            {
                var bytes = Encoding.UTF8.GetBytes(s);
                return new Entry(Convert.ToHexString(SHA256.HashData(bytes), 0, 4).ToLowerInvariant(), bytes);
            })
            .ToList());
    }

    private sealed record Entry(string KeyId, byte[] Secret);
}
