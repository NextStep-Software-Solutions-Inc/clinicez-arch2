using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Files.Queries.GetFileConfig;

namespace PatientAppBE.Api.Endpoints.Files;

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
            .Produces<ApiResponse<FileConfigDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
