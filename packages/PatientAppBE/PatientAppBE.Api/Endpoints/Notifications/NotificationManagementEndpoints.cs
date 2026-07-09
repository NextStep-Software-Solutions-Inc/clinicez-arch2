using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Notifications.Commands.MarkRead;
using PatientAppBE.Application.Features.Notifications.Commands.UpsertNotificationPreference;
using PatientAppBE.Application.Features.Notifications.Queries.GetNotificationPreferences;

namespace PatientAppBE.Api.Endpoints.Notifications;

public sealed class MarkNotificationReadEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPatch("/patients/{patientId:guid}/notifications/{notificationId:guid}/read", async (
                Guid patientId, Guid notificationId, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new MarkNotificationReadCommand(patientId, notificationId), ct);
                return Results.NoContent();
            })
            .WithTags("Notifications")
            .WithName("MarkNotificationRead")
            .WithSummary("Mark a single notification as read")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class MarkAllNotificationsReadEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/notifications/mark-all-read", async (
                Guid patientId, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new MarkAllNotificationsReadCommand(patientId), ct);
                return Results.NoContent();
            })
            .WithTags("Notifications")
            .WithName("MarkAllNotificationsRead")
            .WithSummary("Mark all notifications as read for a patient")
            .Produces(StatusCodes.Status204NoContent)
            .RequireAuthorization();
    }
}

public sealed class GetNotificationPreferencesEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/notification-preferences", async (
                Guid patientId, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new GetNotificationPreferencesQuery(patientId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<NotificationPreferenceDto>>.Success(result));
            })
            .WithTags("Notifications")
            .WithName("GetNotificationPreferences")
            .WithSummary("Get all notification category preferences for a patient")
            .Produces<ApiResponse<IReadOnlyList<NotificationPreferenceDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record UpsertNotificationPreferenceRequest(bool PushEnabled, bool InAppEnabled);

public sealed class UpsertNotificationPreferenceEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPut("/patients/{patientId:guid}/notification-preferences/{category}", async (
                Guid patientId, string category,
                UpsertNotificationPreferenceRequest request,
                ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new UpsertNotificationPreferenceCommand(
                    patientId, category, request.PushEnabled, request.InAppEnabled), ct);
                return Results.Ok(ApiResponse<NotificationPreferenceDto>.Success(result));
            })
            .WithTags("Notifications")
            .WithName("UpsertNotificationPreference")
            .WithSummary("Set push/in-app preference for a notification category. Creates if not exists.")
            .Produces<ApiResponse<NotificationPreferenceDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .RequireAuthorization();
    }
}
