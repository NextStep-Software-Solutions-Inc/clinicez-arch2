using MediatR;

namespace ClinicEz.Pharmacy.Application.Features.Products.Commands.CreateProduct;

// Final version: Non-positional, immutable record.
public sealed record CreateProductCommand : IRequest<Guid>
{
    public required string Name { get; init; }
    public required string Sku { get; init; }
    public decimal Price { get; init; }
}



