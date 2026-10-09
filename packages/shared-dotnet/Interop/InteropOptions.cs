using ClinicEz.Shared.Security;

namespace ClinicEz.Shared.Interop;

/// <summary>Bound from the <c>Messaging</c> configuration section. There are no default credentials.</summary>
public sealed class InteropOptions
{
    public const string Section = "Messaging";

    /// <summary><c>Hub</c> (production) or <c>InProcess</c> (tests only).</summary>
    public string Transport { get; set; } = "Hub";

    /// <summary>Base URL of this service's cell hub: the cloud hub, or the edge cell's local hub.</summary>
    public string HubUrl { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>
    /// This client's ECDSA P-256 private signing key (PEM or base64 of PEM). Every envelope this service sends is signed with it;
    /// the hub holds the matching public key. Required outside Development (see <see cref="InteropStartupCheck"/>).
    /// </summary>
    public string? SigningKey { get; set; }

    /// <summary>
    /// Verify the signature of every received envelope against the key the hub publishes for its signer.
    /// Null (default) means on outside Development, off in Development.
    /// </summary>
    public bool? VerifyInbound { get; set; }

    /// <summary>The mailbox this service reads: one of <see cref="InteropServices"/> (clinic, laboratory, ...).</summary>
    public string Service { get; set; } = string.Empty;

    /// <summary>Set false to register the SDK without starting the relay/poller (tests, tooling, migrations).</summary>
    public bool Enabled { get; set; } = true;

    public int RelayIntervalMs { get; set; } = 1000;
    public int PollWaitSeconds { get; set; } = 20;
    public int BatchSize { get; set; } = 50;
    public int OutboxRetentionDays { get; set; } = 7;
    public int InboxRetentionDays { get; set; } = 14;

    public bool IsInProcess => string.Equals(Transport, "InProcess", StringComparison.OrdinalIgnoreCase);

    /// <summary>Throws with an actionable message if a Hub transport is not fully configured.</summary>
    public void Validate()
    {
        if (IsInProcess) return;
        if (!string.Equals(Transport, "Hub", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Messaging:Transport must be 'Hub' or 'InProcess' (was '{Transport}').");

        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(HubUrl)) missing.Add("Messaging:HubUrl");
        if (string.IsNullOrWhiteSpace(ClientId)) missing.Add("Messaging:ClientId");
        if (string.IsNullOrWhiteSpace(ClientSecret)) missing.Add("Messaging:ClientSecret");
        if (string.IsNullOrWhiteSpace(Service)) missing.Add("Messaging:Service");
        if (missing.Count > 0)
            throw new InvalidOperationException(
                $"Interop hub is not configured. Missing: {string.Join(", ", missing)}. (There are no built-in fallback credentials.)");

        if (PemKey.Normalize(SigningKey, "Messaging:SigningKey") is { } signingKey)
            PemKey.ImportEcdsa(signingKey, "Messaging:SigningKey").Dispose();
    }
}
