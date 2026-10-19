using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public class CreateBlogArticleCommandValidator : AbstractValidator<CreateBlogArticleCommand>
{
    public CreateBlogArticleCommandValidator()
    {
        RuleFor(v => v.Title)
            .NotEmpty().WithMessage("Title is required.")
            .MaximumLength(150).WithMessage("Title must not exceed 150 characters.");

        RuleFor(v => v.Slug)
            .NotEmpty().WithMessage("Slug is required.")
            .MaximumLength(100).WithMessage("Slug must not exceed 100 characters.")
            .Matches("^[a-z0-9-]+$").WithMessage("Slug can only contain lowercase letters, numbers, and hyphens.");

        RuleFor(v => v.Content)
            .NotEmpty().WithMessage("Content is required.");

        RuleFor(v => v.Summary)
            .NotEmpty().WithMessage("Summary is required.")
            .MaximumLength(300).WithMessage("Summary must not exceed 300 characters.");

        RuleFor(v => v.Author)
            .NotEmpty().WithMessage("Author is required.")
            .MaximumLength(100).WithMessage("Author must not exceed 100 characters.");

        RuleFor(v => v.Category)
            .NotEmpty().WithMessage("Category is required.")
            .MaximumLength(50).WithMessage("Category must not exceed 50 characters.");

        RuleFor(v => v.Status)
            .NotEmpty().WithMessage("Status is required.")
            .Must(s => s == "Draft" || s == "Published").WithMessage("Status must be either 'Draft' or 'Published'.");
    }
}
