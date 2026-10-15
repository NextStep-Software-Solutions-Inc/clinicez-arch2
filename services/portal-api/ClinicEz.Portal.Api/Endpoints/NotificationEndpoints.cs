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
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/portal/notifications")
            .RequireAuthorization()
            .WithTags("Portal Notifications");

        group.MapGet("", async (
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) =>
        {
            var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? httpContext.User.FindFirst("sub")?.Value;

            var query = db.PortalNotifications
                .Where(n => !n.IsDeleted && (n.UserId == null || n.UserId == userId));

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

            return Results.Ok(ApiResponse<PortalNotificationListDto>.Success(new PortalNotificationListDto(items, unreadCount)));
        });

        group.MapPost("/{id:guid}/read", async (
            Guid id,
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) =>
        {
            var notification = await db.PortalNotifications
                .FirstOrDefaultAsync(n => n.Id == id && !n.IsDeleted, ct);

            if (notification == null)
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
        });

        group.MapPost("/read-all", async (
            HttpContext httpContext,
            IApplicationDbContext db,
            CancellationToken ct) =>
        {
            var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? httpContext.User.FindFirst("sub")?.Value;

            var unread = await db.PortalNotifications
                .Where(n => !n.IsDeleted && !n.IsRead && (n.UserId == null || n.UserId == userId))
                .ToListAsync(ct);

            var now = DateTime.UtcNow;
            foreach (var n in unread)
            {
                n.IsRead = true;
                n.ReadAt = now;
                n.UpdatedAt = now;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(ApiResponse<int>.Success(unread.Count, $"{unread.Count} notifications marked as read."));
        });
    }
}
