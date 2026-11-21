using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record PortalNotificationDto(
    Guid Id,
    Guid TenantId,
    string? UserId,
    string Title,
    string Body,
    string Category,
    string Severity,
    string? ActionUrl,
    bool IsRead,
    DateTime CreatedAt);

public sealed record PortalNotificationListDto(
    List<PortalNotificationDto> Items,
    int UnreadCount);

public class NotificationEndpoints : IEndpoint
{
    private static string? GetAuthenticatedUserId(HttpContext httpContext) =>
        httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? httpContext.User.FindFirst("sub")?.Value;

    private static async Task<HashSet<Guid>> GetAuthorizedTenantIdsAsync(
        string userId,
        IApplicationDbContext db,
        CancellationToken ct)
    {
        var ownedTenantIds = await db.Tenants
            .Where(t => !t.IsDeleted && t.ArchivedAt == null && t.OwnerId == userId)
            .Select(t => t.Id)
            .ToListAsync(ct);

        var memberTenantIds = await db.WorkspaceMembers
            .Where(m => !m.IsDeleted && m.UserId == userId && m.Status == MemberStatus.Active)
            .Join(
                db.Tenants.Where(t => !t.IsDeleted && t.ArchivedAt == null),
                m => m.TenantId,
                t => t.Id,
                (_, t) => t.Id)
            .ToListAsync(ct);

        var authorized = new HashSet<Guid>(ownedTenantIds);
        authorized.UnionWith(memberTenantIds);
        return authorized;
    }

    private static async Task<(bool Forbidden, HashSet<Guid> ScopedTenantIds)> ResolveTenantScopeAsync(
        string userId,
        string? tenantSlug,
        IApplicationDbContext db,
        CancellationToken ct)
    {
        var authorizedTenantIds = await GetAuthorizedTenantIdsAsync(userId, db, ct);

        if (string.IsNullOrWhiteSpace(tenantSlug))
        {
            return (false, authorizedTenantIds);
        }

        var slugLower = tenantSlug.Trim().ToLowerInvariant();
        var targetTenant = await db.Tenants
            .Where(t => !t.IsDeleted && t.ArchivedAt == null)
            .FirstOrDefaultAsync(
                t => t.TenantSlug.ToLower() == slugLower || t.Id.ToString().ToLower() == slugLower,
                ct);

        if (targetTenant == null || !authorizedTenantIds.Contains(targetTenant.Id))
        {
            return (true, new HashSet<Guid>());
        }

        return (false, new HashSet<Guid> { targetTenant.Id });
    }

    public static async Task<IResult> GetNotificationsAsync(
        string? tenantSlug,
        HttpContext httpContext,
        IApplicationDbContext db,
        CancellationToken ct)
    {
        var userId = GetAuthenticatedUserId(httpContext);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Results.Unauthorized();
        }

        var (forbidden, scopedTenantIds) = await ResolveTenantScopeAsync(userId, tenantSlug, db, ct);
        if (forbidden)
        {
            return Results.Forbid();
        }

        if (scopedTenantIds.Count == 0)
        {
            return Results.Ok(ApiResponse<PortalNotificationListDto>.Success(
                new PortalNotificationListDto(new List<PortalNotificationDto>(), 0)));
        }

        var query = db.PortalNotifications
            .Where(n =>
                !n.IsDeleted
                && scopedTenantIds.Contains(n.TenantId)
                && (n.UserId == null || n.UserId == userId));

        var unreadCount = await query.CountAsync(n => !n.IsRead, ct);

        var items = await query
            .OrderByDescending(n => !n.IsRead)
            .ThenByDescending(n => n.CreatedAt)
            .Take(50)
            .Select(n => new PortalNotificationDto(
                n.Id,
                n.TenantId,
                n.UserId,
                n.Title,
                n.Body,
                n.Category,
                n.Severity,
                n.ActionUrl,
                n.IsRead,
                n.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<PortalNotificationListDto>.Success(
            new PortalNotificationListDto(items, unreadCount)));
    }

    public static async Task<IResult> MarkAsReadAsync(
        Guid id,
        HttpContext httpContext,
        IApplicationDbContext db,
        CancellationToken ct)
    {
        var userId = GetAuthenticatedUserId(httpContext);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Results.Unauthorized();
        }

        var authorizedTenantIds = await GetAuthorizedTenantIdsAsync(userId, db, ct);
        if (authorizedTenantIds.Count == 0)
        {
            return Results.NotFound(ApiResponse<bool>.Fail("Notification not found.", "NOT_FOUND"));
        }

        var notification = await db.PortalNotifications
            .FirstOrDefaultAsync(n => n.Id == id && !n.IsDeleted, ct);

        if (notification == null
            || !authorizedTenantIds.Contains(notification.TenantId)
            || (notification.UserId != null && notification.UserId != userId))
        {
            return Results.NotFound(ApiResponse<bool>.Fail("Notification not found.", "NOT_FOUND"));
        }

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            notification.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(ApiResponse<bool>.Success(true, "Notification marked as read."));
    }

    public static async Task<IResult> MarkAllAsReadAsync(
        string? tenantSlug,
        HttpContext httpContext,
        IApplicationDbContext db,
        CancellationToken ct)
    {
        var userId = GetAuthenticatedUserId(httpContext);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Results.Unauthorized();
        }

        var (forbidden, scopedTenantIds) = await ResolveTenantScopeAsync(userId, tenantSlug, db, ct);
        if (forbidden)
        {
            return Results.Forbid();
        }

        if (scopedTenantIds.Count == 0)
        {
            return Results.Ok(ApiResponse<int>.Success(0, "0 notifications marked as read."));
        }

        var unread = await db.PortalNotifications
            .Where(n =>
                !n.IsDeleted
                && !n.IsRead
                && scopedTenantIds.Contains(n.TenantId)
                && (n.UserId == null || n.UserId == userId))
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var n in unread)
        {
            n.IsRead = true;
            n.ReadAt = now;
            n.UpdatedAt = now;
        }

        if (unread.Count > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(ApiResponse<int>.Success(unread.Count, $"{unread.Count} notifications marked as read."));
    }

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/portal/notifications")
            .RequireAuthorization()
            .WithTags("Portal Notifications");

        group.MapGet("", (
            string? tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) => GetNotificationsAsync(tenantSlug, httpContext, db, ct));

        group.MapPost("/{id:guid}/read", (
            Guid id,
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) => MarkAsReadAsync(id, httpContext, db, ct));

        group.MapPost("/read-all", (
            string? tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) => MarkAllAsReadAsync(tenantSlug, httpContext, db, ct));
    }
}
