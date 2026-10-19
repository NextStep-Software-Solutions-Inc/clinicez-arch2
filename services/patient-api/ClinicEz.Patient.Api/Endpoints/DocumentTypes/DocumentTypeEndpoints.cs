using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ClinicEz.Patient.Application.Features.DocumentTypes.Commands;
using ClinicEz.Patient.Application.Features.DocumentTypes.Queries;

using ClinicEz.Patient.Api.Abstractions;

namespace ClinicEz.Patient.Api.Endpoints.DocumentTypes;

public class DocumentTypeEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/document-types")
            .WithTags("Document Types");

        group.MapGet("/", async (IMediator mediator) =>
        {
            var result = await mediator.Send(new GetDocumentTypesQuery());
            return Results.Ok(result);
        })
        .WithName("GetDocumentTypes")
        .WithDescription("Retrieves all document types.")
        .WithTags("Document Types");

        group.MapPost("/", async (CreateDocumentTypeCommand command, IMediator mediator) =>
        {
            var id = await mediator.Send(command);
            return Results.Created($"/api/v1/document-types/{id}", id);
        })
        .WithName("CreateDocumentType")
        .WithDescription("Creates a new document type.")
        .WithTags("Document Types");

        group.MapPut("/{id:guid}", async (Guid id, UpdateDocumentTypeCommand command, IMediator mediator) =>
        {
            if (id != command.Id) return Results.BadRequest("ID mismatch");
            
            var success = await mediator.Send(command);
            return success ? Results.NoContent() : Results.NotFound();
        })
        .WithName("UpdateDocumentType")
        .WithDescription("Updates an existing document type.")
        .WithTags("Document Types");

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
        {
            var success = await mediator.Send(new DeleteDocumentTypeCommand(id));
            return success ? Results.NoContent() : Results.NotFound();
        })
        .WithName("DeleteDocumentType")
        .WithDescription("Deletes a document type by its unique ID.")
        .WithTags("Document Types");
    }
}
