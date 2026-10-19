using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Blogs.Queries;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public class PublicBlogEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/blogs").WithTags("PublicBlogs");

        // 1. GET /blogs
        group.MapGet("/", async (ISender sender) =>
        {
            var result = await sender.Send(new GetPublishedBlogsQuery());
            return Results.Ok(result);
        })
        .WithName("GetPublishedBlogs")
        .WithDescription("Retrieves all published marketing blog articles.")
        .WithTags("PublicBlogs");

        // 2. GET /blogs/{slug}
        group.MapGet("/{slug}", async (string slug, ISender sender) =>
        {
            var result = await sender.Send(new GetBlogBySlugQuery(slug));
            return result != null ? Results.Ok(result) : Results.NotFound("Blog post not found");
        })
        .WithName("GetPublishedBlogBySlug")
        .WithDescription("Retrieves a single published blog article by its slug and increments view counts.")
        .WithTags("PublicBlogs");
    }
}
