using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareCode;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Application.Features.Sharing.Commands.RevokeAccessGrant;
using ClinicEz.Patient.Application.Features.Sharing.Queries.ExportPatientData;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessLog;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Patient.Api.Endpoints.Sharing;

public sealed record CreateShareTokenRequest(IReadOnlyList<string>? Scopes, string? Purpose, int? MaxRedemptions = null);

public sealed record CreateShareCodeRequest(IReadOnlyList<string>? Scopes, string? Purpose);

public sealed class CreateShareTokenEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/share-tokens", async (
                Guid patientId, CreateShareTokenRequest request, ISender sender, CancellationToken ct) =>
            {
                var token = await sender.Send(new CreateShareTokenCommand(patientId, request.Scopes ?? [], request.Purpose, request.MaxRedemptions), ct);
                return Results.Ok(ApiResponse<ShareTokenDto>.Success(token));
            })
            .WithTags("Sharing")
            .WithName("CreateShareToken")
            .WithSummary("Create a short-lived share token to render as a QR code")
            .WithDescription("Signs a token for the chosen categories (Demographics, Allergies, Medications, Conditions, Immunizations, LabResults, Prescriptions, Vitals). A facility that scans it receives a fresh snapshot limited to those categories; maxRedemptions (default 1) is how many scans the QR allows before it expires.")
            .Produces<ApiResponse<ShareTokenDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .RequireAuthorization();
    }
}

public sealed class CreateShareCodeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/share-codes", async (
                Guid patientId, CreateShareCodeRequest request, ISender sender, CancellationToken ct) =>
            {
                var code = await sender.Send(new CreateShareCodeCommand(patientId, request.Scopes ?? [], request.Purpose), ct);
                return Results.Ok(ApiResponse<ShareCodeDto>.Success(code));
            })
            .WithTags("Sharing")
            .WithName("CreateShareCode")
            .WithSummary("Create a short one-time code to read out instead of showing a QR")
            .WithDescription("Returns a code such as K7QM-X4NP, valid for minutes and usable once. A facility redeems it by typing it together with the patient ClinicEzId; it receives a snapshot limited to the chosen categories.")
            .Produces<ApiResponse<ShareCodeDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .RequireAuthorization();
    }
}

public sealed class GetAccessGrantsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/access-grants", async (Guid patientId, ISender sender, CancellationToken ct) =>
            {
                var grants = await sender.Send(new GetAccessGrantsQuery(patientId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<AccessGrantDto>>.Success(grants));
            })
            .WithTags("Sharing")
            .WithName("GetAccessGrants")
            .WithSummary("List the facilities that hold or held access to the patient's data")
            .WithDescription("Every grant, newest first, with its scopes, source and status (active, expired or revoked).")
            .Produces<ApiResponse<IReadOnlyList<AccessGrantDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class RevokeAccessGrantEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/access-grants/{grantId:guid}", async (
                Guid patientId, Guid grantId, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new RevokeAccessGrantCommand(patientId, grantId), ct);
                return Results.Ok(ApiResponse<object?>.Success(null));
            })
            .WithTags("Sharing")
            .WithName("RevokeAccessGrant")
            .WithSummary("Revoke a facility's access to the patient's data")
            .WithDescription("Ends future fetches by that facility. Whatever the facility already imported into its own chart stays there.")
            .Produces<ApiResponse<object?>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class GetAccessLogEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/access-log", async (
                Guid patientId, ISender sender, CancellationToken ct,
                Guid? grantId = null, int skip = 0, int take = 50) =>
            {
                var page = await sender.Send(new GetAccessLogQuery(patientId, grantId, skip, take), ct);
                return Results.Ok(ApiResponse<AccessLogPageDto>.Success(page));
            })
            .WithTags("Sharing")
            .WithName("GetAccessLog")
            .WithSummary("Who accessed the patient's data, and when")
            .WithDescription("Audit entries, newest first, optionally limited to one grant.")
            .Produces<ApiResponse<AccessLogPageDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class ExportPatientDataEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/export", async (
                Guid patientId, HttpContext http, ISender sender, CancellationToken ct) =>
            {
                var export = await sender.Send(new ExportPatientDataQuery(patientId), ct);
                http.Response.Headers.CacheControl = "no-store";
                http.Response.Headers.ContentDisposition = $"attachment; filename=\"clinicez-export-{export.ExportedAt:yyyyMMdd}.json\"";
                return Results.Ok(export);
            })
            .WithTags("Sharing")
            .WithName("ExportPatientData")
            .WithSummary("Download everything Clinic EZ holds about the patient")
            .WithDescription("A single JSON document (not wrapped in the API envelope) with the profile, appointments, documents, grants and access log.")
            .Produces<PatientDataExportDto>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
