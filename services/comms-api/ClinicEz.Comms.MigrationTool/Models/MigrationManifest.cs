using System;
using System.Collections.Generic;

namespace ClinicEz.Comms.MigrationTool.Models;

public sealed class MigrationManifest
{
    public string ManifestVersion { get; set; } = "1.0";
    public Guid BundleId { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public DateTime ExportedAtUtc { get; set; } = DateTime.UtcNow;

    public CellInfo SourceCell { get; set; } = new();
    public TargetCellInfo TargetCell { get; set; } = new();

    public string SchemaVersion { get; set; } = "20261026144020";
    public CryptoInfo Crypto { get; set; } = new();

    public Dictionary<string, DatasetSummary> Datasets { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public AttachmentsSummary AttachmentsSummary { get; set; } = new();

    public string? Signature { get; set; }
}

public sealed class CellInfo
{
    public string CellId { get; set; } = "cloud";
    public string CellType { get; set; } = "Cloud"; // Cloud or OnPrem
    public string ServiceVersion { get; set; } = "1.0.0";
    public string DbSchema { get; set; } = "comms";
}

public sealed class TargetCellInfo
{
    public string CellId { get; set; } = "onprem";
    public string CellType { get; set; } = "OnPrem";
    public string ExpectedTenantId { get; set; } = string.Empty;
}

public sealed class CryptoInfo
{
    public string SessionKeyAlgorithm { get; set; } = "AES-256-GCM";
    public string KeyDerivation { get; set; } = "PBKDF2-HMAC-SHA256";
    public string KdfSaltBase64 { get; set; } = string.Empty;
    public int KdfIterations { get; set; } = 100000;
    public string SessionKeyIvBase64 { get; set; } = string.Empty;
    public string SessionKeyTagBase64 { get; set; } = string.Empty;
    public string WrappedSessionKeyBase64 { get; set; } = string.Empty;
    public string SignerClientId { get; set; } = "clinicez-comms-signer";
    public string SignerPublicKeyPem { get; set; } = string.Empty;
}

public sealed class DatasetSummary
{
    public string FileName { get; set; } = string.Empty;
    public int RecordCount { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string CompositeMerkleHash { get; set; } = string.Empty;
}

public sealed class AttachmentsSummary
{
    public int TotalCount { get; set; }
    public long TotalCiphertextBytes { get; set; }
    public string AttachmentCheckTreeSha256 { get; set; } = string.Empty;
}
