using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Notifications.Queries.GetNotifications;

namespace ClinicEz.Patient.Api.Endpoints.Notifications;

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
            .WithDescription("Retrieves a paginated list of push or in-app notifications for the patient, with an option to filter for unread only.")
            .Produces<ApiResponse<NotificationListDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
