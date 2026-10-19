using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Files.Queries.GetFileConfig;

namespace ClinicEz.Patient.Api.Endpoints.Files;

public sealed class GetFileConfigEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/files/config", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var config = await sender.Send(new GetFileConfigQuery(patientId), ct);
                return Results.Ok(ApiResponse<FileConfigDto>.Success(config));
            })
            .WithTags("Files")
            .WithName("GetFileConfig")
            .WithSummary("Get E2EE config and storage quota for the current patient")
            .WithDescription("Retrieves the client-side end-to-end encryption configuration (like Encrypted Master Key) and storage quota metrics for a patient.")
            .Produces<ApiResponse<FileConfigDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
