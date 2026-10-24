using System;
using System.Collections.Generic;
using System.Threading;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Features.DocumentTypes.Commands;
using ClinicEz.Patient.Application.Features.DocumentTypes.DTOs;
using ClinicEz.Patient.Application.Features.DocumentTypes.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.DocumentTypes;

public class DocumentTypeEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/document-types")
            .WithTags("Document Types")
            .RequireAuthorization();

        group.MapGet("", async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDocumentTypesQuery(), ct);
            return Results.Ok(ApiResponse<List<DocumentTypeDto>>.Success(result));
        })
        .WithName("GetDocumentTypes")
        .WithDescription("Retrieves all document types for client synchronization.")
        .Produces<ApiResponse<List<DocumentTypeDto>>>(StatusCodes.Status200OK);

        group.MapPost("", async (CreateDocumentTypeCommand command, ISender sender, CancellationToken ct) =>
        {
            var id = await sender.Send(command, ct);
            return Results.Created($"/api/v1/document-types/{id}", ApiResponse<Guid>.Success(id));
        })
        .WithName("CreateDocumentType")
        .WithDescription("Creates a new document type.")
        .Produces<ApiResponse<Guid>>(StatusCodes.Status201Created);

        group.MapPut("/{id:guid}", async (Guid id, UpdateDocumentTypeCommand command, ISender sender, CancellationToken ct) =>
        {
            if (id != command.Id)
            {
                return Results.Json(
                    ApiResponse<object>.Fail("ID mismatch.", [new ApiFieldError("id", ErrorCodes.InvalidFieldFormat, "Route ID must match payload ID.")]),
                    statusCode: StatusCodes.Status400BadRequest);
            }

            var success = await sender.Send(command, ct);
            return success
                ? Results.NoContent()
                : Results.Json(ApiResponse<object>.Fail("Document type not found."), statusCode: StatusCodes.Status404NotFound);
        })
        .WithName("UpdateDocumentType")
        .WithDescription("Updates an existing document type.")
        .Produces(StatusCodes.Status204NoContent)
        .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var success = await sender.Send(new DeleteDocumentTypeCommand(id), ct);
            return success
                ? Results.NoContent()
                : Results.Json(ApiResponse<object>.Fail("Document type not found."), statusCode: StatusCodes.Status404NotFound);
        })
        .WithName("DeleteDocumentType")
        .WithDescription("Deletes a document type by its unique ID.")
        .Produces(StatusCodes.Status204NoContent)
        .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);
    }
}
