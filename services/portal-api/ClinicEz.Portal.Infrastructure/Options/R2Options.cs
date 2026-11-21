namespace ClinicEz.Portal.Infrastructure.Options;

public sealed class R2Options
{
    public const string SectionName = "R2";
    public const string DefaultBucketName = "clinicez-portal-uploads";

    public string AccountId { get; set; } = string.Empty;
    public string BucketName { get; set; } = DefaultBucketName;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string PublicUrl { get; set; } = string.Empty;

    public string ResolveBucketName()
        => string.IsNullOrWhiteSpace(BucketName) ? DefaultBucketName : BucketName.Trim();

    public bool IsConfigured()
        => !string.IsNullOrWhiteSpace(AccountId)
        && !string.IsNullOrWhiteSpace(AccessKeyId)
        && !string.IsNullOrWhiteSpace(SecretAccessKey);
}
