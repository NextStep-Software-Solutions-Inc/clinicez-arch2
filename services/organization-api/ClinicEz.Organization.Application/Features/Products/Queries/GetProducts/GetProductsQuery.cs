using ClinicEz.Organization.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Organization.Application.Features.Products.Queries.GetProducts;

public sealed record GetProductsQuery : IRequest<PaginatedApiResponse<Product>>
{
    public int PageNumber { get; init; } = 1;
    public int PageSize { get; init; } = 10;
    public string? Filters { get; init; }
    public string? Sorts { get; init; }
}



