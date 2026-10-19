using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Sieve.Models;

namespace ClinicEz.Clinic.Application.Features.Products.Queries.GetProducts;

public sealed class GetProductsQueryHandler(IUnitOfWork unitOfWork)
        : IRequestHandler<GetProductsQuery, PaginatedApiResponse<Product>>
{

    public async Task<PaginatedApiResponse<Product>> Handle(
        GetProductsQuery request,
        CancellationToken cancellationToken)
    {
        var sieveModel = new SieveModel
        {
            PageSize = request.PageSize,
            Page = request.PageNumber,
            Filters = request.Filters,
            Sorts = request.Sorts
        };

        // Call the repository to get the data
        var (products, totalCount) = await unitOfWork.ProductRepository.GetAllAsync(sieveModel, cancellationToken: cancellationToken);

        // Create the response
        return new PaginatedApiResponse<Product>(
            [.. products],
            request.PageNumber,
            request.PageSize,
            totalCount);
    }
}


