using System;
using System.Collections.Generic;

namespace ClinicEz.V1Sync.Api.Services.Storage;

public sealed class Track3StorageOptions
{
    public const string SectionName = "Track3Storage";

    public bool Enabled { get; set; } = true;
    public int MaxConcurrency { get; set; } = 6;
    public long MaxFileSizeBytes { get; set; } = 50L * 1024 * 1024;
    public double VerificationSampleRate { get; set; } = 0.02;
    public bool AzureBlob1Enabled { get; set; } = true;
    public string? AzureBlob1OriginOverride { get; set; }
    public Track3BucketOptions ClinicR2 { get; set; } = new();
    public Track3BucketOptions PatientR2 { get; set; } = new();
    public Dictionary<string, AzureAccountAuthOptions> AzureAccounts { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class Track3BucketOptions
{
    public string? ServiceUrl { get; set; }
    public string? AccountId { get; set; }
    public string BucketName { get; set; } = string.Empty;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string Region { get; set; } = "auto";
    public bool ForcePathStyle { get; set; } = true;
}

public sealed class AzureAccountAuthOptions
{
    public string? SasToken { get; set; }
    public string? ConnectionString { get; set; }
}
