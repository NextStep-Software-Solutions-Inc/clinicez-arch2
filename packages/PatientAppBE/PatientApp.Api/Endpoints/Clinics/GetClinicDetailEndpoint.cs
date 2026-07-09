using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Clinics.Queries.GetClinicDetail;

namespace PatientApp.Api.Endpoints.Clinics;

public sealed class GetClinicDetailEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/clinics/{clinicId:guid}", async (
                Guid clinicId, ISender sender, CancellationToken ct, Guid? forPatientId = null) =>
            {
                var result = await sender.Send(new GetClinicDetailQuery(clinicId, forPatientId), ct);
                return result is null
                    ? Results.NotFound(ApiResponse<object>.Fail($"Clinic '{clinicId}' was not found."))
                    : Results.Ok(ApiResponse<ClinicDetailDto>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("GetClinicDetail")
            .WithSummary("Get full clinic details including linked organizations and current patient membership status")
            .Produces<ApiResponse<ClinicDetailDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
