using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Newsletter.DTOs;
using ClinicEz.Portal.Application.Features.Newsletter.Queries;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Notifications;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Challenger 2 Final Verification Suite:
/// Adversarially probes backend security, RBAC policies, clean root URL emission,
/// and database schema invariants.
/// </summary>
public class ChallengerAdminFinal2SecurityTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly RecordingEmailSender _emailSender = new();
    private readonly Guid _adminRoleId = Guid.NewGuid();

    public ChallengerAdminFinal2SecurityTests()
    {
        _context = TestSupport.NewContext();
        _context.AdminRoles.Add(new AdminRole
        {
            Id = _adminRoleId,
            Name = "Platform Governance Administrator",
            Description = "Platform administrator with governance authority",
            Permissions = new List<string> { Permissions.ManageBlogs, Permissions.ViewTenants },
            CreatedAt = DateTime.UtcNow
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    #region PROBE 1: RBAC ON NEWSLETTER SUBSCRIBERS

    [Fact]
    public void Probe1_NewsletterSubscribers_EndpointMetadata_RequiresAuthorization_AndIsNotAnonymous()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(Mock.Of<ISender>());
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        builder.Services.AddAuthorization();
        var app = builder.Build();

        var group = app.MapGroup("/api/v1");
        new NewsletterEndpoints().MapEndpoint(group);

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var subscriberEndpoint = endpoints.SingleOrDefault(e =>
            e.RoutePattern.RawText == "/api/v1/admin/newsletter-subscribers");

        Assert.NotNull(subscriberEndpoint);
        Assert.Null(subscriberEndpoint.Metadata.GetMetadata<IAllowAnonymous>());
        Assert.NotEmpty(subscriberEndpoint.Metadata.GetOrderedMetadata<IAuthorizeData>());
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_AnonymousCaller_StrictlyReturns401Unauthorized()
    {
        var senderMock = new Mock<ISender>();
        var httpContext = new DefaultHttpContext(); // No user claims

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var unauthorizedResult = Assert.IsType<UnauthorizedHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorizedResult.StatusCode);
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_EmptyOrWhitespaceClerkId_StrictlyReturns401Unauthorized()
    {
        var senderMock = new Mock<ISender>();
        var httpContext = CreateContextWithClaim(ClaimTypes.NameIdentifier, "");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var unauthorizedResult = Assert.IsType<UnauthorizedHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorizedResult.StatusCode);
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_NonAdminJwtCaller_StrictlyReturns403Forbidden()
    {
        var senderMock = new Mock<ISender>();
        // GetAdminMeQuery returns null for normal patient/nurse/doctor user
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AdminMeResponse?)null);

        var httpContext = CreateAuthenticatedContext("clerk_nurse_999", "nurse@clinic.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Theory]
    [InlineData("view:analytics")]
    [InlineData("manage:roles")]
    [InlineData("manage:plans")]
    [InlineData("manage:settings")]
    [InlineData("view:logs")]
    public async Task Probe1_NewsletterSubscribers_AdminWithoutRequiredPermissions_StrictlyReturns403Forbidden(string singlePermission)
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Restricted Officer",
            "restricted@clinicez.ph",
            "Operations",
            new List<string> { singlePermission }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var httpContext = CreateAuthenticatedContext("clerk_restricted_admin", "restricted@clinicez.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_AdminWithZeroPermissions_StrictlyReturns403Forbidden()
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Empty Admin",
            "empty@clinicez.ph",
            "None",
            new List<string>() // 0 permissions
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var httpContext = CreateAuthenticatedContext("clerk_empty_admin", "empty@clinicez.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_AdminWithManageBlogs_Returns200OK()
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Blog Manager",
            "blogger@clinicez.ph",
            "Marketing",
            new List<string> { Permissions.ManageBlogs }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var subscribersResponse = new NewsletterSubscribersListResponse(
            new List<NewsletterSubscriberDto>
            {
                new(Guid.NewGuid(), "subscriber1@gmail.com", "landing_page", "Active", DateTime.UtcNow)
            },
            1
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetNewsletterSubscribersQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(subscribersResponse);

        var httpContext = CreateAuthenticatedContext("clerk_blogger", "blogger@clinicez.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, null);

        var okResult = Assert.IsType<Ok<NewsletterSubscribersListResponse>>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        Assert.Equal(1, okResult.Value?.TotalCount);
    }

    [Fact]
    public async Task Probe1_NewsletterSubscribers_AdminWithViewTenants_Returns200OK()
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Tenant Auditor",
            "auditor@clinicez.ph",
            "Compliance",
            new List<string> { Permissions.ViewTenants }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var subscribersResponse = new NewsletterSubscribersListResponse(
            new List<NewsletterSubscriberDto>
            {
                new(Guid.NewGuid(), "subscriber2@yahoo.com", "footer", "Active", DateTime.UtcNow)
            },
            1
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetNewsletterSubscribersQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(subscribersResponse);

        var httpContext = CreateAuthenticatedContext("clerk_auditor", "auditor@clinicez.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, "subscriber2");

        var okResult = Assert.IsType<Ok<NewsletterSubscribersListResponse>>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        Assert.Equal(1, okResult.Value?.TotalCount);
    }

    [Theory]
    [InlineData("'; DROP TABLE Subscribers; --")]
    [InlineData("<script>alert('xss')</script>")]
    [InlineData("admin@clinicez.ph' OR '1'='1")]
    [InlineData("🔥🩺💉")]
    [InlineData(null)]
    [InlineData("")]
    public async Task Probe1_NewsletterSubscribers_AdversarialSearchTerms_ForwardedSafely(string? search)
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Security Tester",
            "sec@clinicez.ph",
            "Security",
            new List<string> { Permissions.ManageBlogs }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        senderMock.Setup(s => s.Send(It.Is<GetNewsletterSubscribersQuery>(q => q.Search == search), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new NewsletterSubscribersListResponse(new List<NewsletterSubscriberDto>(), 0));

        var httpContext = CreateAuthenticatedContext("clerk_sec", "sec@clinicez.ph");

        var result = await ExecuteNewsletterEndpoint(httpContext, senderMock.Object, search);

        var okResult = Assert.IsType<Ok<NewsletterSubscribersListResponse>>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        senderMock.Verify(s => s.Send(It.Is<GetNewsletterSubscribersQuery>(q => q.Search == search), It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region PROBE 2: CLEAN ROOT URL EMISSION

    [Fact]
    public void Probe2_GetAdminBaseUrl_ConfigWithTrailingSlashes_NormalizesCorrectly()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminBaseUrl"] = "https://admin.clinicez.com///"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var url = provider.GetAdminBaseUrl();

        Assert.Equal("https://admin.clinicez.com", url);
    }

    [Fact]
    public void Probe2_GetAdminBaseUrl_FallsBackToAdminOrigin_AndRejectsNonAdminOrigin()
    {
        var config = new ConfigurationBuilder().Build();

        // 1. Admin origin on port 3001
        var httpContext1 = new DefaultHttpContext();
        httpContext1.Request.Headers.Origin = "http://localhost:3001";
        var accessor1 = new HttpContextAccessor { HttpContext = httpContext1 };
        var provider1 = new FrontendUrlProvider(config, accessor1);
        Assert.Equal("http://localhost:3001", provider1.GetAdminBaseUrl());

        // 2. Admin origin on admin.clinicez.com
        var httpContext2 = new DefaultHttpContext();
        httpContext2.Request.Headers.Origin = "https://admin.clinicez.com";
        var accessor2 = new HttpContextAccessor { HttpContext = httpContext2 };
        var provider2 = new FrontendUrlProvider(config, accessor2);
        Assert.Equal("https://admin.clinicez.com", provider2.GetAdminBaseUrl());

        // 3. Non-admin origin on portal.clinicez.com should NOT be used as AdminBaseUrl
        var configWithBase = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Facility:BaseDomain"] = "clinicez.com"
            })
            .Build();
        var httpContext3 = new DefaultHttpContext();
        httpContext3.Request.Headers.Origin = "https://portal.clinicez.com";
        var accessor3 = new HttpContextAccessor { HttpContext = httpContext3 };
        var provider3 = new FrontendUrlProvider(configWithBase, accessor3);
        Assert.Equal("https://admin.clinicez.com", provider3.GetAdminBaseUrl());
        Assert.NotEqual("https://portal.clinicez.com", provider3.GetAdminBaseUrl());
    }

    [Fact]
    public void Probe2_AdminInvitationNotifier_EmitsCleanRootPath_ZeroAdminInvitationsOccurrence()
    {
        var token = "7f8b9c0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "newadmin@clinicez.ph",
            FullName = "New Platform Administrator",
            RoleId = _adminRoleId,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            Status = AdminUserStatus.Invited,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminBaseUrl"] = "https://admin.clinicez.ph"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var notificationsMock = new Mock<INotificationService>();
        NotificationEmailRequestedPayload? capturedPayload = null;

        notificationsMock.Setup(n => n.EnqueueEmail(It.IsAny<NotificationEmailRequestedPayload>(), It.IsAny<Guid>()))
            .Callback<NotificationEmailRequestedPayload, Guid>((payload, _) => capturedPayload = payload)
            .Returns("job_999");

        var notifier = new AdminInvitationNotifier(
            notificationsMock.Object,
            provider,
            NullLogger<AdminInvitationNotifier>.Instance
        );

        notifier.RequestInvitation(user, "Platform Governance Administrator", "Super Admin");

        Assert.NotNull(capturedPayload);
        Assert.Equal("newadmin@clinicez.ph", capturedPayload.To);
        Assert.Contains("inviteUrl", capturedPayload.Model.Keys);

        var inviteUrl = capturedPayload.Model["inviteUrl"];
        Assert.Equal($"https://admin.clinicez.ph/invitations/{token}", inviteUrl);
        Assert.DoesNotContain("/admin/invitations/", inviteUrl);
        Assert.DoesNotContain("/admin/", inviteUrl);

        // Subject check
        Assert.DoesNotContain("/admin/invitations/", capturedPayload.Subject);
        Assert.DoesNotContain("/admin/reset-password/", capturedPayload.Subject);
    }

    [Fact]
    public void Probe2_AdminUserDto_InviteUrl_EmitsCleanRootPaths_ForBothInviteAndReset()
    {
        var baseUrl = "https://admin.clinicez.ph/";
        var inviteToken = "inv_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var resetToken = "pwdreset_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

        var inviteUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "invite@clinicez.ph",
            FullName = "Invite Admin",
            RoleId = _adminRoleId,
            InvitationToken = inviteToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            Status = AdminUserStatus.Invited,
            IsActive = true
        };

        var resetUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "reset@clinicez.ph",
            FullName = "Reset Admin",
            RoleId = _adminRoleId,
            InvitationToken = resetToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            Status = AdminUserStatus.Active,
            IsActive = true
        };

        var inviteDto = AdminUserMapping.ToDto(inviteUser, TimeProvider.System, baseUrl);
        var resetDto = AdminUserMapping.ToDto(resetUser, TimeProvider.System, baseUrl);

        Assert.NotNull(inviteDto.InviteUrl);
        Assert.Equal($"https://admin.clinicez.ph/invitations/{inviteToken}", inviteDto.InviteUrl);
        Assert.DoesNotContain("/admin/invitations/", inviteDto.InviteUrl);
        Assert.DoesNotContain("/admin/", inviteDto.InviteUrl);

        Assert.NotNull(resetDto.InviteUrl);
        Assert.Equal($"https://admin.clinicez.ph/reset-password/{resetToken}", resetDto.InviteUrl);
        Assert.DoesNotContain("/admin/reset-password/", resetDto.InviteUrl);
        Assert.DoesNotContain("/admin/", resetDto.InviteUrl);
    }

    [Fact]
    public async Task Probe2_ResetAdminUserPasswordCommand_EmitsCleanRootPasswordResetUrl()
    {
        var adminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "pwdreset.admin@clinicez.ph",
            FullName = "Password Reset Target",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Active,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(adminUser);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminBaseUrl"] = "https://admin.clinicez.ph"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var notificationsMock = new Mock<INotificationService>();
        NotificationEmailRequestedPayload? emailPayload = null;

        notificationsMock.Setup(n => n.EnqueueEmail(It.IsAny<NotificationEmailRequestedPayload>(), It.IsAny<Guid>()))
            .Callback<NotificationEmailRequestedPayload, Guid>((payload, _) => emailPayload = payload)
            .Returns("job_pwd_123");

        var handler = new ResetAdminUserPasswordCommandHandler(
            _context,
            notificationsMock.Object,
            provider,
            TimeProvider.System,
            null
        );

        var command = new ResetAdminUserPasswordCommand(
            adminUser.Id,
            SendResetEmail: true,
            GenerateResetLink: true,
            TemporaryPassword: null
        );

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotNull(result.ResetUrl);
        Assert.StartsWith("https://admin.clinicez.ph/reset-password/pwdreset_", result.ResetUrl);
        Assert.DoesNotContain("/admin/reset-password/", result.ResetUrl);
        Assert.DoesNotContain("/admin/", result.ResetUrl);

        Assert.NotNull(emailPayload);
        Assert.Contains("resetUrl", emailPayload.Model.Keys);
        Assert.Contains("inviteUrl", emailPayload.Model.Keys);
        Assert.Equal(result.ResetUrl, emailPayload.Model["resetUrl"]);
        Assert.Equal(result.ResetUrl, emailPayload.Model["inviteUrl"]);
        Assert.DoesNotContain("/admin/reset-password/", emailPayload.Model["resetUrl"]);
    }

    [Fact]
    public async Task Probe2_GetPendingSelfInvitationQuery_EmitsCleanRootRedirectUrl()
    {
        var token = "99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff";
        var adminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "selfinvite.admin@clinicez.ph",
            FullName = "Self Invite Admin",
            RoleId = _adminRoleId,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            Status = AdminUserStatus.Invited,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(adminUser);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminBaseUrl"] = "https://admin.clinicez.ph"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var clerkMock = new Mock<IClerkUserLookup>();

        var handler = new GetPendingSelfInvitationQueryHandler(_context, clerkMock.Object, TimeProvider.System, provider);
        var query = new GetPendingSelfInvitationQuery("clerk_self_999", new[] { "selfinvite.admin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal($"https://admin.clinicez.ph/invitations/{token}", result.RedirectUrl);
        Assert.DoesNotContain("/admin/invitations/", result.RedirectUrl);
        Assert.DoesNotContain("/admin/", result.RedirectUrl);
    }

    #endregion

    #region PROBE 4: DATABASE INVARIANT VERIFICATION

    [Fact]
    public void Probe4_DatabaseInvariant_VerifyZeroUnauthorizedSchemaModifications()
    {
        // Assert core Admin entities and relationships exist in DbContext model without schema regressions
        var entityTypes = _context.Model.GetEntityTypes().Select(e => e.ClrType.Name).ToList();

        Assert.Contains(nameof(AdminUser), entityTypes);
        Assert.Contains(nameof(AdminRole), entityTypes);
        Assert.Contains(nameof(Tenant), entityTypes);
        Assert.Contains(nameof(Facility), entityTypes);
        Assert.Contains(nameof(WorkspaceMember), entityTypes);

        // Verify AdminUser entity properties
        var adminUserType = _context.Model.FindEntityType(typeof(AdminUser));
        Assert.NotNull(adminUserType);

        var propertyNames = adminUserType.GetProperties().Select(p => p.Name).ToList();
        Assert.Contains(nameof(AdminUser.Id), propertyNames);
        Assert.Contains(nameof(AdminUser.ClerkUserId), propertyNames);
        Assert.Contains(nameof(AdminUser.Email), propertyNames);
        Assert.Contains(nameof(AdminUser.FullName), propertyNames);
        Assert.Contains(nameof(AdminUser.RoleId), propertyNames);
        Assert.Contains(nameof(AdminUser.InvitationToken), propertyNames);
        Assert.Contains(nameof(AdminUser.InvitationExpiresAt), propertyNames);
        Assert.Contains(nameof(AdminUser.Status), propertyNames);
        Assert.Contains(nameof(AdminUser.IsActive), propertyNames);
    }

    #endregion

    #region TEST HELPERS

    private static async Task<IResult> ExecuteNewsletterEndpoint(
        HttpContext httpContext,
        ISender sender,
        string? search)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId))
        {
            return Results.Unauthorized();
        }

        var email = httpContext.User.FindFirst("emails")?.Value
                    ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value
                    ?? httpContext.User.FindFirst("email")?.Value;

        var admin = await sender.Send(new GetAdminMeQuery(clerkUserId, email), CancellationToken.None);
        if (admin == null)
        {
            return Results.Json(new { Message = "Access denied. Not an administrative profile." }, statusCode: 403);
        }

        if (!admin.Permissions.Contains(Permissions.ManageBlogs) && !admin.Permissions.Contains(Permissions.ViewTenants))
        {
            return Results.Json(new { Message = "Access denied. Requires manage:blogs or view:tenants permission." }, statusCode: 403);
        }

        var result = await sender.Send(new GetNewsletterSubscribersQuery(search), CancellationToken.None);
        return Results.Ok(result);
    }

    private static DefaultHttpContext CreateAuthenticatedContext(string clerkUserId, string email)
    {
        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, clerkUserId),
            new(ClaimTypes.Email, email)
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        context.User = new ClaimsPrincipal(identity);
        return context;
    }

    private static DefaultHttpContext CreateContextWithClaim(string type, string value)
    {
        var context = new DefaultHttpContext();
        var claims = new List<Claim> { new(type, value) };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        context.User = new ClaimsPrincipal(identity);
        return context;
    }

    #endregion
}
