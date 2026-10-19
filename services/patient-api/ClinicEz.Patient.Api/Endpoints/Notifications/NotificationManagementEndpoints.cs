using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Notifications.Commands.MarkRead;
using ClinicEz.Patient.Application.Features.Notifications.Commands.UpsertNotificationPreference;
using ClinicEz.Patient.Application.Features.Notifications.Queries.GetNotificationPreferences;

namespace ClinicEz.Patient.Api.Endpoints.Notifications;

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
            .WithDescription("Marks a specific notification as read by its unique ID for the patient.")
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
            .WithDescription("Marks all notifications as read for the specified patient.")
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
            .WithDescription("Retrieves the notification settings and preferences (e.g. push or in-app enabled) across categories for the patient.")
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
            .WithDescription("Updates or creates the push and in-app notification preferences for a specific category.")
            .Produces<ApiResponse<NotificationPreferenceDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .RequireAuthorization();
    }
}
