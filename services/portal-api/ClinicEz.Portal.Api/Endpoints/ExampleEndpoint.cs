using ClinicEz.Portal.Api.Abstractions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class ExampleEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("example", () => Results.Ok("Portal API is working!"))
           .WithName("GetExample")
           .WithDescription("Returns a simple text response to verify if the Portal API is working.")
           .WithTags("Example");
    }
}