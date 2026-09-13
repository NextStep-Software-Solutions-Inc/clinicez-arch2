using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;

namespace ClinicEz.Patient.Api.Endpoints.BookingDrafts;

public sealed record CreateBookingDraftRequest(
    Guid ClinicId,
    Guid? OrganizationId,
    DateOnly? PreferredDate,
    string? PreferredTime,
    string? Reason,
    string? Notes,
    string ShareFieldsJson,
    string AttachedFileIdsJson);

public sealed class CreateBookingDraftEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/booking-drafts", async (
                Guid patientId, CreateBookingDraftRequest request,
                ISender sender, CancellationToken ct) =>
            {
                var id = await sender.Send(new CreateBookingDraftCommand(
                    patientId, request.ClinicId, request.OrganizationId,
                    request.PreferredDate, request.PreferredTime,
                    request.Reason, request.Notes, request.ShareFieldsJson, request.AttachedFileIdsJson ?? "[]"), ct);

                return Results.Created(
                    $"/api/v1/patients/{patientId}/booking-drafts/{id}",
                    ApiResponse<Guid>.Success(id));
            })
            .WithTags("Bookings")
            .WithName("CreateBookingDraft")
            .WithSummary("Create a booking draft (appointment request) for a patient")
            .WithDescription("Creates a new draft appointment request with preferred details, reason, and notes for a patient.")
            .Produces<ApiResponse<Guid>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class SubmitBookingDraftEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/booking-drafts/{draftId:guid}/submit", async (
                Guid patientId, Guid draftId, ISender sender, CancellationToken ct) =>
            {
                var bookingRef = await sender.Send(new SubmitBookingDraftCommand(patientId, draftId), ct);
                return Results.Accepted(
                    (string?)null,
                    ApiResponse<string?>.Success(bookingRef, "Booking submitted to clinic."));
            })
            .WithTags("Bookings")
            .WithName("SubmitBookingDraft")
            .WithSummary("Submit a ready booking draft to the Clinic Dashboard API")
            .WithDescription("Submits an existing, ready booking draft to the destination clinic for review and approval.")
            .Produces<ApiResponse<string?>>(StatusCodes.Status202Accepted)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .RequireAuthorization();
    }
}
