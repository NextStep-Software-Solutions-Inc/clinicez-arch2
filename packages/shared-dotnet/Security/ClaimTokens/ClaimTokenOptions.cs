namespace ClinicEz.Shared.Security.ClaimTokens;

public sealed class ClaimTokenOptions
{
    public const string SectionName = "ClaimToken";
    public const string SigningKeySetting = "ClaimToken:SigningKey";
    public const string SigningKeyEnvironmentVariable = "CLAIM_TOKEN_SIGNING_KEY";
    public const int MinimumKeyBytes = 32;

    public string? SigningKey { get; set; }
}
