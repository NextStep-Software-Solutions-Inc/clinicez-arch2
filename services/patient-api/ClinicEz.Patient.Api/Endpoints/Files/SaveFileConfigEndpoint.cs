using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Files.Commands.SaveFileConfig;

namespace ClinicEz.Patient.Api.Endpoints.Files;

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
            .WithDescription("Saves the client-side end-to-end encryption configuration (specifically the Encrypted Master Key) for the patient.")
            .Produces<ApiResponse<object>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record SaveFileConfigRequest(string EncryptedMAK);
