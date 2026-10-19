using System;
using System.Text;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class BasicAuthTests
{
    private static string Header(string user, string password) =>
        "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{password}"));

    [Fact]
    public void Matches_AcceptsTheExactCredentials()
    {
        BasicAuth.Matches(Header("admin", "s3cret-Pass"), "admin", "s3cret-Pass").Should().BeTrue();
    }

    [Fact]
    public void Matches_AllowsColonsInThePassword()
    {
        BasicAuth.Matches(Header("admin", "a:b:c"), "admin", "a:b:c").Should().BeTrue();
    }

    [Theory]
    [InlineData("admin", "wrong")]
    [InlineData("root", "s3cret-Pass")]
    [InlineData("admin", "")]
    [InlineData("", "s3cret-Pass")]
    public void Matches_RejectsWrongCredentials(string user, string password)
    {
        BasicAuth.Matches(Header(user, password), "admin", "s3cret-Pass").Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer abc")]
    [InlineData("Basic !!!not-base64!!!")]
    [InlineData("Basic bm9jb2xvbg==")]
    public void Matches_RejectsMissingOrMalformedHeaders(string? header)
    {
        BasicAuth.Matches(header, "admin", "s3cret-Pass").Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Matches_DeniesEveryoneWhenNoPasswordIsConfigured(string? configuredPassword)
    {
        BasicAuth.Matches(Header("admin", ""), "admin", configuredPassword).Should().BeFalse();
        BasicAuth.Matches(Header("admin", "changeme"), "admin", configuredPassword).Should().BeFalse();
    }
}