using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public sealed class ClerkUserLookupTests
{
    private sealed class StubHttpMessageHandler(
        Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(responder(request));
        }
    }

    private static HttpClient CreateConfiguredClient(StubHttpMessageHandler handler, string? bearerToken = "sk_test_valid")
    {
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.clerk.com/v1/")
        };
        if (!string.IsNullOrWhiteSpace(bearerToken))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        }
        return client;
    }

    [Fact]
    public async Task GetVerifiedEmailsAsync_GoogleOAuthPayloadWithUnrecognizedExternalAccountShape_ReturnsVerifiedEmail()
    {
        // Includes an external_accounts verification entry missing "object" and unknown passkey/metadata shapes
        // that caused Clerk.BackendAPI SDK full-User deserialization to throw and fail closed.
        const string payload = """
            {
              "id": "user_google_oauth_1",
              "object": "user",
              "primary_email_address_id": "idn_google_1",
              "email_addresses": [
                {
                  "id": "idn_google_1",
                  "object": "email_address",
                  "email_address": "  LovelyJean.Maureal@NextStep-Software.com ",
                  "verification": {
                    "object": "verification_from_oauth",
                    "status": "verified",
                    "strategy": "from_oauth_google",
                    "attempts": null,
                    "expire_at": null
                  }
                }
              ],
              "external_accounts": [
                {
                  "object": "google_account",
                  "id": "eac_123",
                  "provider": "oauth_google",
                  "email_address": "lovelyjean.maureal@nextstep-software.com",
                  "verification": {
                    "status": "verified",
                    "strategy": "oauth_google",
                    "expire_at": null
                  }
                }
              ]
            }
            """;

        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        });

        using var client = CreateConfiguredClient(handler);
        var lookup = new ClerkUserLookup(client, NullLogger<ClerkUserLookup>.Instance);

        var emails = await lookup.GetVerifiedEmailsAsync("user_google_oauth_1");

        Assert.Single(emails);
        Assert.Equal("lovelyjean.maureal@nextstep-software.com", emails[0]);
        Assert.Equal("https://api.clerk.com/v1/users/user_google_oauth_1", handler.LastRequest?.RequestUri?.ToString());
    }

    [Fact]
    public async Task GetVerifiedEmailsAsync_MultiEmailMix_ReturnsOnlyVerifiedEmailsNormalizedAndDeduplicated()
    {
        const string payload = """
            {
              "id": "user_multi_1",
              "primary_email_address_id": "idn_primary_unverified",
              "email_addresses": [
                {
                  "id": "idn_primary_unverified",
                  "email_address": "unverified-primary@clinicez.net",
                  "verification": { "status": "unverified", "strategy": "email_code" }
                },
                {
                  "id": "idn_null_verif",
                  "email_address": "null-verif@clinicez.net",
                  "verification": null
                },
                {
                  "id": "idn_expired",
                  "email_address": "expired@clinicez.net",
                  "verification": { "status": "expired", "strategy": "email_link" }
                },
                {
                  "id": "idn_oauth",
                  "email_address": "OAuth.Admin@ClinicEz.net",
                  "verification": { "object": "verification_from_oauth", "status": "verified", "strategy": "from_oauth_google" }
                },
                {
                  "id": "idn_otp",
                  "email_address": "otp.admin@clinicez.net",
                  "verification": { "object": "verification_otp", "status": "verified", "strategy": "email_code" }
                },
                {
                  "id": "idn_otp_dup",
                  "email_address": "  OTP.ADMIN@clinicez.net ",
                  "verification": { "status": "verified", "strategy": "email_link" }
                }
              ]
            }
            """;

        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        });

        using var client = CreateConfiguredClient(handler);
        var lookup = new ClerkUserLookup(client, NullLogger<ClerkUserLookup>.Instance);

        var emails = await lookup.GetVerifiedEmailsAsync("user_multi_1");

        Assert.Equal(2, emails.Count);
        Assert.Contains("oauth.admin@clinicez.net", emails);
        Assert.Contains("otp.admin@clinicez.net", emails);
        Assert.DoesNotContain("unverified-primary@clinicez.net", emails);
        Assert.DoesNotContain("null-verif@clinicez.net", emails);
        Assert.DoesNotContain("expired@clinicez.net", emails);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task GetVerifiedEmailsAsync_NonSuccessStatus_FailsClosedWithEmptyList(HttpStatusCode statusCode)
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(statusCode)
        {
            Content = new StringContent("{\"errors\":[{\"message\":\"error\"}]}", Encoding.UTF8, "application/json")
        });

        using var client = CreateConfiguredClient(handler);
        var lookup = new ClerkUserLookup(client, NullLogger<ClerkUserLookup>.Instance);

        var emails = await lookup.GetVerifiedEmailsAsync("user_123");

        Assert.Empty(emails);
    }

    [Fact]
    public async Task GetVerifiedEmailsAsync_MissingAuthHeaderOrMalformedJson_FailsClosedWithEmptyList()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{not-valid-json", Encoding.UTF8, "application/json")
        });

        using var unauthClient = CreateConfiguredClient(handler, bearerToken: null);
        var unauthLookup = new ClerkUserLookup(unauthClient, NullLogger<ClerkUserLookup>.Instance);
        Assert.Empty(await unauthLookup.GetVerifiedEmailsAsync("user_123"));
        Assert.Null(handler.LastRequest);

        using var malformedClient = CreateConfiguredClient(handler, bearerToken: "sk_test_valid");
        var malformedLookup = new ClerkUserLookup(malformedClient, NullLogger<ClerkUserLookup>.Instance);
        Assert.Empty(await malformedLookup.GetVerifiedEmailsAsync("user_123"));
    }

    [Fact]
    public async Task AcceptAdminInvitation_GoogleOAuthWithEmptyJwtEmailClaims_ActivatesAdminViaClerkLookup()
    {
        using var context = TestSupport.NewContext();
        var roleId = Guid.NewGuid();
        context.AdminRoles.Add(new AdminRole
        {
            Id = roleId,
            Name = "Super Admin",
            Description = "Full governance access",
            Permissions = new List<string> { "view:analytics" }
        });

        var token = TokenGenerator.GenerateSecureToken(32);
        var invited = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "lovelyjean.maureal@nextstep-software.com",
            FullName = "Lovely Jean Maureal",
            RoleId = roleId,
            Status = AdminUserStatus.Invited,
            IsActive = true,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        context.AdminUsers.Add(invited);
        await context.SaveChangesAsync();

        const string clerkUserJson = """
            {
              "id": "user_google_lovely",
              "primary_email_address_id": "idn_google_lovely",
              "email_addresses": [
                {
                  "id": "idn_google_lovely",
                  "email_address": "lovelyjean.maureal@nextstep-software.com",
                  "verification": {
                    "object": "verification_from_oauth",
                    "status": "verified",
                    "strategy": "from_oauth_google"
                  }
                }
              ],
              "external_accounts": [
                {
                  "object": "google_account",
                  "provider": "oauth_google",
                  "verification": {
                    "status": "verified",
                    "strategy": "oauth_google"
                  }
                }
              ]
            }
            """;

        var httpHandler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(clerkUserJson, Encoding.UTF8, "application/json")
        });
        using var httpClient = CreateConfiguredClient(httpHandler);
        var clerkLookup = new ClerkUserLookup(httpClient, NullLogger<ClerkUserLookup>.Instance);

        var urlMock = new Mock<IFrontendUrlProvider>();
        urlMock.Setup(u => u.GetAdminBaseUrl()).Returns("https://admin.clinicez.net");

        var cmdHandler = new AcceptAdminInvitationCommandHandler(context, urlMock.Object, TimeProvider.System, clerkLookup);

        // Simulate Clerk default session JWT carrying only sub (no email claims)
        var result = await cmdHandler.Handle(
            new AcceptAdminInvitationCommand(token, "user_google_lovely", Email: null, VerifiedEmails: Array.Empty<string>()),
            CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("user_google_lovely", result.ClerkUserId);

        var persisted = await context.AdminUsers.FindAsync(invited.Id);
        Assert.NotNull(persisted);
        Assert.Equal(AdminUserStatus.Active, persisted.Status);
        Assert.Equal("user_google_lovely", persisted.ClerkUserId);
        Assert.NotNull(persisted.JoinedAt);
    }
}
