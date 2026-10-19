namespace ClinicEz.Shared.Security.ClaimTokens;

public interface IClaimTokenService
{
    string IssueToken(ClaimTokenClaims claims);
    ClaimTokenValidationResult ValidateToken(string token);
}
