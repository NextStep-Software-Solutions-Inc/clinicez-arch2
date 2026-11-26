using System.Security.Claims;
using ClinicEz.Patient.Api.Auth;
using FluentAssertions;

namespace ClinicEz.Patient.Api.Tests.Authentication;

public sealed class ClaimEmailExtractorTests
{
    [Fact]
    public void ExtractVerifiedEmails_WhenPrincipalIsNull_ReturnsEmpty()
    {
        ClaimEmailExtractor.ExtractVerifiedEmails(null).Should().BeEmpty();
    }

    [Fact]
    public void ExtractVerifiedEmails_WhenEmailVerifiedClaimIsMissing_ReturnsEmpty()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email", "patient@ustp.edu.ph"),
            new Claim("emails", "[\"alt@ustp.edu.ph\"]")
        ], "TestAuth"));

        ClaimEmailExtractor.ExtractVerifiedEmails(principal).Should().BeEmpty();
    }

    [Theory]
    [InlineData("false")]
    [InlineData("FALSE")]
    [InlineData("0")]
    [InlineData("no")]
    [InlineData("")]
    [InlineData("   ")]
    public void ExtractVerifiedEmails_WhenEmailVerifiedIsNotTrue_ReturnsEmpty(string claimValue)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", claimValue),
            new Claim("email", "patient@ustp.edu.ph"),
            new Claim("emails", "alt@ustp.edu.ph")
        ], "TestAuth"));

        ClaimEmailExtractor.ExtractVerifiedEmails(principal).Should().BeEmpty();
    }

    [Fact]
    public void ExtractVerifiedEmails_WhenConflictingVerifiedClaimsExist_ReturnsEmpty()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", "true"),
            new Claim("email_verified", "false"),
            new Claim("email", "patient@ustp.edu.ph")
        ], "TestAuth"));

        ClaimEmailExtractor.ExtractVerifiedEmails(principal).Should().BeEmpty();
    }

    [Theory]
    [InlineData("true")]
    [InlineData("TRUE")]
    [InlineData(" true ")]
    public void ExtractVerifiedEmails_WhenEmailVerifiedIsTrue_ExtractsNormalizedDeduplicatedEmails(string claimValue)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", claimValue),
            new Claim(ClaimTypes.Email, "Patient@ustp.edu.ph"),
            new Claim("email", "patient@ustp.edu.ph"),
            new Claim("emails", "[\"Alt1@ustp.edu.ph\", \"alt2@ustp.edu.ph\"]")
        ], "TestAuth"));

        var result = ClaimEmailExtractor.ExtractVerifiedEmails(principal);

        result.Should().BeEquivalentTo(["patient@ustp.edu.ph", "alt1@ustp.edu.ph", "alt2@ustp.edu.ph"]);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("unverified")]
    [InlineData("yes")]
    public void ExtractVerifiedEmails_WhenMixedTrueAndNonTrueVerifiedClaimsExist_ReturnsEmpty(string secondaryClaimValue)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", "true"),
            new Claim("email_verified", secondaryClaimValue),
            new Claim("email", "patient@ustp.edu.ph")
        ], "TestAuth"));

        ClaimEmailExtractor.ExtractVerifiedEmails(principal).Should().BeEmpty();
    }

    [Fact]
    public void ExtractVerifiedEmails_WhenEmailsClaimContainsJsonObjects_ExtractsNormalizedEmailFields()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", "true"),
            new Claim("emails", "[{\"email\":\"First@Example.com\"},{\"email_address\":\"Second@Example.com\"},{\"emailAddress\":\"Third@Example.com\"},{\"other\":\"ignored\"}]")
        ], "TestAuth"));

        var result = ClaimEmailExtractor.ExtractVerifiedEmails(principal);

        result.Should().BeEquivalentTo(["first@example.com", "second@example.com", "third@example.com"]);
    }

    [Theory]
    [InlineData("[{\"email\":\"broken@example.com\", bad}]")]
    [InlineData("[not-valid-json, \"raw@example.com\"]")]
    [InlineData("[123, true, {\"foo\":\"bar\"}]")]
    public void ExtractVerifiedEmails_WhenEmailsClaimIsMalformedOrNonEmailJsonArray_ReturnsEmptyWithoutSplitting(string malformedArray)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", "user_123"),
            new Claim("email_verified", "true"),
            new Claim("emails", malformedArray)
        ], "TestAuth"));

        ClaimEmailExtractor.ExtractVerifiedEmails(principal).Should().BeEmpty();
    }
}
