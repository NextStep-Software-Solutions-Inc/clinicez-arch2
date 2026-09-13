using FluentValidation;

namespace ClinicEz.Laboratory.Application.Features.Products.Commands.CreateProduct;

public sealed class CreateProductCommandValidator : AbstractValidator<CreateProductCommand>
{
    public CreateProductCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
                .WithMessage("Product name is required.")
            .MaximumLength(200)
                .WithMessage("Product name must not exceed 200 characters.");

        RuleFor(x => x.Sku)
            .NotEmpty()
                .WithMessage("SKU is required.")
            .MaximumLength(50)
                .WithMessage("SKU must not exceed 50 characters.")
            .Matches(@"^[A-Z0-9\-]+$")
                .WithMessage("SKU must contain only uppercase letters, numbers, and hyphens.");

        RuleFor(x => x.Price)
            .GreaterThan(0)
                .WithMessage("Price must be greater than zero.");
    }
}




