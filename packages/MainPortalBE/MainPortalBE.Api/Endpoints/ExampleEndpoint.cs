using MainPortalBE.Api.Abstractions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace MainPortalBE.Api.Endpoints;

public sealed class ExampleEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("example", () => Results.Ok("Portal API is working!"))
           .WithTags("Example");
    }
}