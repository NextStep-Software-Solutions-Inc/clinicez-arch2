using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Patients.Queries.StreamPatientAvatar;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed class StreamPatientAvatarEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/avatar", async (
                Guid patientId,
                HttpContext httpContext,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new StreamPatientAvatarQuery(patientId), ct);
                if (!string.IsNullOrWhiteSpace(result.ExternalRedirectUrl))
                {
                    return Results.Redirect(result.ExternalRedirectUrl, permanent: false);
                }

                httpContext.Response.Headers.CacheControl = "private, max-age=3600";
                if (!string.IsNullOrWhiteSpace(result.ETag))
                {
                    httpContext.Response.Headers.ETag = $"\"{result.ETag}\"";
                }

                return Results.File(
                    fileStream: result.Stream,
                    contentType: result.ContentType);
            })
            .WithTags("Patients")
            .WithName("StreamPatientAvatar")
            .WithSummary("Stream decrypted patient profile avatar")
            .WithDescription("Decrypts the patient's AES-256-GCM encrypted profile avatar from R2 using PMK, or redirects to an allowlisted legacy external avatar URL.")
            .Produces(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status403Forbidden)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
