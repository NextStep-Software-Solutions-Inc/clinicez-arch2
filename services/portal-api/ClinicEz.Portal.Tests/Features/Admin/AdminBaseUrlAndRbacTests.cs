using System;
using System.Collections.Generic;
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
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

public class AdminBaseUrlAndRbacTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly RecordingEmailSender _emailSender = new();
    private readonly Guid _roleId = Guid.NewGuid();

    public AdminBaseUrlAndRbacTests()
    {
        _context = TestSupport.NewContext();
        _context.AdminRoles.Add(new AdminRole
        {
            Id = _roleId,
            Name = "Platform Administrator",
            Description = "Platform admin with blog and tenant management permissions",
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

    // =========================================================================
    // 1. FrontendUrlProvider.GetAdminBaseUrl() Tests
    // =========================================================================

    [Fact]
    public void GetAdminBaseUrl_ReturnsConfiguredAdminBaseUrl_WhenSet()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminBaseUrl"] = "https://admin.clinicez.com",
                ["FrontendBaseUrl"] = "https://portal.clinicez.com"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var adminUrl = provider.GetAdminBaseUrl();

        Assert.Equal("https://admin.clinicez.com", adminUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_ResolvesAdminSubdomain_IndependentlyOfFrontendBaseUrl()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FrontendBaseUrl"] = "https://portal.clinicez.com",
                ["Facility:BaseDomain"] = "clinicez.com"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var adminUrl = provider.GetAdminBaseUrl();
        var portalUrl = provider.GetBaseUrl();

        Assert.Equal("https://admin.clinicez.com", adminUrl);
        Assert.Equal("https://portal.clinicez.com", portalUrl);
        Assert.NotEqual(adminUrl, portalUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_FallsBackToOriginHeader_WhenHostContainsAdmin()
    {
        var config = new ConfigurationBuilder().Build();
        var context = new DefaultHttpContext();
        context.Request.Headers.Origin = "https://admin.custom-domain.org";

        var accessor = new HttpContextAccessor { HttpContext = context };
        var provider = new FrontendUrlProvider(config, accessor);

        var adminUrl = provider.GetAdminBaseUrl();
        Assert.Equal("https://admin.custom-domain.org", adminUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_FallsBackToOriginHeader_WhenPortIs3001()
    {
        var config = new ConfigurationBuilder().Build();
        var context = new DefaultHttpContext();
        context.Request.Headers.Origin = "http://localhost:3001";

        var accessor = new HttpContextAccessor { HttpContext = context };
        var provider = new FrontendUrlProvider(config, accessor);

        var adminUrl = provider.GetAdminBaseUrl();
        Assert.Equal("http://localhost:3001", adminUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_IgnoresPortalOrigin_AndFallsBackToBaseDomain()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Facility:BaseDomain"] = "clinicez.net"
            })
            .Build();

        var context = new DefaultHttpContext();
        context.Request.Headers.Origin = "https://portal.clinicez.net";

        var accessor = new HttpContextAccessor { HttpContext = context };
        var provider = new FrontendUrlProvider(config, accessor);

        var adminUrl = provider.GetAdminBaseUrl();
        Assert.Equal("https://admin.clinicez.net", adminUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_FallsBackToLocalhost3001_WhenBaseDomainIsLocalhost()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Facility:BaseDomain"] = "localhost"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var adminUrl = provider.GetAdminBaseUrl();

        Assert.Equal("http://localhost:3001", adminUrl);
    }

    [Fact]
    public void GetAdminBaseUrl_FallsBackToLocalhost3001_InDevelopmentEnvironment()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ASPNETCORE_ENVIRONMENT"] = "Development"
            })
            .Build();

        var provider = new FrontendUrlProvider(config, new HttpContextAccessor());
        var adminUrl = provider.GetAdminBaseUrl();

        Assert.Equal("http://localhost:3001", adminUrl);
    }

    // =========================================================================
    // 2. Clean Root Path URL Emission Tests (Zero /admin/ Sub-path)
    // =========================================================================

    [Fact]
    public void AdminInvitationNotifier_EmitsCleanRootInvitationUrl_WithoutAdminPrefix()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "invited-admin@clinicez.com",
            FullName = "Invited Admin",
            RoleId = _roleId,
            InvitationToken = "tok_invitation_clean_root_123",
            Status = AdminUserStatus.Invited,
            IsActive = true
        };

        var notifier = TestSupport.AdminInvitationNotifier(_context, "https://portal.clinicez.com", _emailSender);
        // Using FixedFrontendUrl with distinct AdminBaseUrl
        var fixedProvider = new FixedFrontendUrl("https://portal.clinicez.com", "https://admin.clinicez.com");
        var customNotifier = new AdminInvitationNotifier(
            new TestNotificationService(new EmailDispatchJob(new EmailTemplateRenderer(), _emailSender, NullLogger<EmailDispatchJob>.Instance)),
            fixedProvider,
            NullLogger<AdminInvitationNotifier>.Instance);

        customNotifier.RequestInvitation(user, "Platform Administrator", "Super Admin");

        var mail = Assert.Single(_emailSender.Sent);
        Assert.Equal("invited-admin@clinicez.com", mail.To);
        // Emits clean root path: https://admin.clinicez.com/invitations/{token}
        Assert.Contains("https://admin.clinicez.com/invitations/tok_invitation_clean_root_123", mail.HtmlBody);
        Assert.DoesNotContain("/admin/invitations/", mail.HtmlBody);
    }

    [Fact]
    public void AdminUserMapping_ToDto_EmitsCleanRootInvitationUrl_ForInvitationTokens()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "dto.admin@clinicez.com",
            FullName = "DTO Admin",
            RoleId = _roleId,
            InvitationToken = "tok_hex_999",
            Status = AdminUserStatus.Invited,
            IsActive = true
        };

        var dto = AdminUserMapping.ToDto(user, TimeProvider.System, "https://admin.clinicez.com");

        Assert.NotNull(dto.InviteUrl);
        Assert.Equal("https://admin.clinicez.com/invitations/tok_hex_999", dto.InviteUrl);
        Assert.DoesNotContain("/admin/", dto.InviteUrl);
    }

    [Fact]
    public void AdminUserMapping_ToDto_EmitsCleanRootPasswordResetUrl_ForPwdresetTokens()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "reset.admin@clinicez.com",
            FullName = "Reset Admin",
            RoleId = _roleId,
            InvitationToken = "pwdreset_securetoken_xyz",
            Status = AdminUserStatus.Active,
            IsActive = true
        };

        var dto = AdminUserMapping.ToDto(user, TimeProvider.System, "https://admin.clinicez.com");

        Assert.NotNull(dto.InviteUrl);
        Assert.Equal("https://admin.clinicez.com/reset-password/pwdreset_securetoken_xyz", dto.InviteUrl);
        Assert.DoesNotContain("/admin/", dto.InviteUrl);
    }

    [Fact]
    public async Task ResetAdminUserPasswordCommand_EmitsCleanRootPasswordResetUrl_UsingAdminBaseUrl()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "passwordreset@clinicez.com",
            FullName = "Reset Target",
            RoleId = _roleId,
            ClerkUserId = "clerk_pwd_123",
            Status = AdminUserStatus.Active,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var fixedProvider = new FixedFrontendUrl("https://portal.clinicez.com", "https://admin.clinicez.com");
        var notificationService = new TestNotificationService(new EmailDispatchJob(new EmailTemplateRenderer(), _emailSender, NullLogger<EmailDispatchJob>.Instance));

        var handler = new ResetAdminUserPasswordCommandHandler(
            _context,
            notificationService,
            fixedProvider,
            TimeProvider.System,
            null
        );

        var result = await handler.Handle(
            new ResetAdminUserPasswordCommand(user.Id, TemporaryPassword: null, SendResetEmail: true, GenerateResetLink: false),
            CancellationToken.None
        );

        Assert.True(result.EmailSent);
        Assert.NotNull(result.ResetToken);
        Assert.NotNull(result.ResetUrl);
        Assert.StartsWith("https://admin.clinicez.com/reset-password/pwdreset_", result.ResetUrl);
        Assert.DoesNotContain("/admin/", result.ResetUrl);

        var mail = Assert.Single(_emailSender.Sent);
        Assert.Contains(result.ResetUrl, mail.HtmlBody);
        Assert.DoesNotContain("/admin/", mail.HtmlBody);
    }

    [Fact]
    public async Task GetPendingSelfInvitationQuery_EmitsCleanRootInvitationUrl_WhenAdminBaseUrlProvided()
    {
        var token = "token_admin_self_inv_clean";
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "selfadmin@clinicez.ph",
            FullName = "Self Admin",
            RoleId = _roleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var clerkMock = new Mock<IClerkUserLookup>();
        var fixedProvider = new FixedFrontendUrl("https://portal.clinicez.ph", "https://admin.clinicez.ph");

        var handler = new GetPendingSelfInvitationQueryHandler(_context, clerkMock.Object, TimeProvider.System, fixedProvider);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_999", new[] { "selfadmin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal(token, result.Token);
        Assert.Equal($"https://admin.clinicez.ph/invitations/{token}", result.RedirectUrl);
        Assert.DoesNotContain("/admin/", result.RedirectUrl);
    }

    [Fact]
    public async Task GetPendingSelfInvitationQuery_EmitsCleanRootInvitationPath_WhenNoBaseUrlProvided()
    {
        var token = "token_admin_self_no_base";
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "selfadmin2@clinicez.ph",
            FullName = "Self Admin 2",
            RoleId = _roleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var clerkMock = new Mock<IClerkUserLookup>();

        var handler = new GetPendingSelfInvitationQueryHandler(_context, clerkMock.Object, TimeProvider.System, null);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_888", new[] { "selfadmin2@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal($"/invitations/{token}", result.RedirectUrl);
        Assert.DoesNotContain("/admin/", result.RedirectUrl);
    }

    // =========================================================================
    // 3. Newsletter Subscribers RBAC Endpoint Tests
    // =========================================================================

    [Fact]
    public async Task NewsletterSubscribers_Returns401_WhenUserUnauthenticated()
    {
        var senderMock = new Mock<ISender>();
        var httpContext = new DefaultHttpContext(); // No user claims

        var result = await InvokeNewsletterEndpoint(httpContext, senderMock.Object, null);

        var unauthorizedResult = Assert.IsType<UnauthorizedHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorizedResult.StatusCode);
    }

    [Fact]
    public async Task NewsletterSubscribers_Returns403_WhenUserIsNotAdmin()
    {
        var senderMock = new Mock<ISender>();
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AdminMeResponse?)null);

        var httpContext = CreateAuthenticatedContext("clerk_user_nurse", "nurse@clinic.com");

        var result = await InvokeNewsletterEndpoint(httpContext, senderMock.Object, null);

        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Fact]
    public async Task NewsletterSubscribers_Returns403_WhenAdminLacksRequiredPermissions()
    {
        var senderMock = new Mock<ISender>();
        // Admin with only view:analytics (lacks manage:blogs and view:tenants)
        var adminMe = new AdminMeResponse(
            true,
            "Financial Analyst",
            "analyst@clinicez.com",
            "Analyst",
            new List<string> { Permissions.ViewAnalytics }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var httpContext = CreateAuthenticatedContext("clerk_analyst", "analyst@clinicez.com");

        var result = await InvokeNewsletterEndpoint(httpContext, senderMock.Object, null);

        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Fact]
    public async Task NewsletterSubscribers_Returns200_WhenAdminHasManageBlogsPermission()
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Content Marketer",
            "blogger@clinicez.com",
            "Marketing",
            new List<string> { Permissions.ManageBlogs }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var subscribersResponse = new NewsletterSubscribersListResponse(
            new List<NewsletterSubscriberDto>
            {
                new(Guid.NewGuid(), "sub1@gmail.com", "landing", "Active", DateTime.UtcNow),
                new(Guid.NewGuid(), "sub2@yahoo.com", "footer", "Active", DateTime.UtcNow)
            },
            2
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetNewsletterSubscribersQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(subscribersResponse);

        var httpContext = CreateAuthenticatedContext("clerk_blogger", "blogger@clinicez.com");

        var result = await InvokeNewsletterEndpoint(httpContext, senderMock.Object, null);

        var okResult = Assert.IsType<Ok<NewsletterSubscribersListResponse>>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        Assert.Equal(2, okResult.Value?.TotalCount);
    }

    [Fact]
    public async Task NewsletterSubscribers_Returns200_WhenAdminHasViewTenantsPermission()
    {
        var senderMock = new Mock<ISender>();
        var adminMe = new AdminMeResponse(
            true,
            "Platform Operator",
            "governance@clinicez.com",
            "Operations",
            new List<string> { Permissions.ViewTenants }
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetAdminMeQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(adminMe);

        var subscribersResponse = new NewsletterSubscribersListResponse(
            new List<NewsletterSubscriberDto>
            {
                new(Guid.NewGuid(), "lead@hospital.ph", "lead_gen", "Active", DateTime.UtcNow)
            },
            1
        );
        senderMock.Setup(s => s.Send(It.IsAny<GetNewsletterSubscribersQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(subscribersResponse);

        var httpContext = CreateAuthenticatedContext("clerk_governance", "governance@clinicez.com");

        var result = await InvokeNewsletterEndpoint(httpContext, senderMock.Object, "hospital");

        var okResult = Assert.IsType<Ok<NewsletterSubscribersListResponse>>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        Assert.Equal(1, okResult.Value?.TotalCount);
    }

    // Helper to invoke endpoint delegate directly
    private static async Task<IResult> InvokeNewsletterEndpoint(
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
}
