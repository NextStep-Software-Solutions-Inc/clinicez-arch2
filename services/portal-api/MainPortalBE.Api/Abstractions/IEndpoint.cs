namespace MainPortalBE.Api.Abstractions;

/// <summary>
/// REPR pattern contract. Each implementing class owns exactly one HTTP verb + route combination.
/// Endpoints are auto-discovered and registered via <see cref="Extensions.WebApplicationEndpointExtensions"/>.
/// </summary>
public interface IEndpoint
{
    void MapEndpoint(IEndpointRouteBuilder app);
}
