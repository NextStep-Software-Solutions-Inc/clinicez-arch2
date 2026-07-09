using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Files.Commands.SaveFileConfig;

namespace PatientAppBE.Api.Endpoints.Files;

public sealed class SaveFileConfigEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/files/config", async (
                Guid patientId,
                SaveFileConfigRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new SaveFileConfigCommand(patientId, request.EncryptedMAK), ct);
                return Results.Ok(ApiResponse<object>.Success(new object()));
            })
            .WithTags("Files")
            .WithName("SaveFileConfig")
            .WithSummary("Save E2EE config (EncryptedMAK) for the current patient")
            .Produces<ApiResponse<object>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record SaveFileConfigRequest(string EncryptedMAK);
