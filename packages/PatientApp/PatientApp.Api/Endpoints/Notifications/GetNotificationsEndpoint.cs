using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Notifications.Queries.GetNotifications;

namespace PatientApp.Api.Endpoints.Notifications;

public sealed class GetNotificationsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/notifications", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct,
                bool unreadOnly = false,
                int skip = 0,
                int take = 30) =>
            {
                var result = await sender.Send(
                    new GetNotificationsQuery(patientId, unreadOnly, skip, take), ct);

                return Results.Ok(ApiResponse<NotificationListDto>.Success(result));
            })
            .WithTags("Notifications")
            .WithName("GetNotifications")
            .WithSummary("Get paginated notifications for a patient")
            .Produces<ApiResponse<NotificationListDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
