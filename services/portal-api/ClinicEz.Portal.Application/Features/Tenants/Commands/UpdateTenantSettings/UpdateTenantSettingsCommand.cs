using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Tenants.Commands.UpdateTenantSettings;

public record UpdateTenantSettingsCommand(
    string TenantSlug,
    string? Name = null,
    string? RepresentativeName = null,
    string? Email = null,
    string? PhoneNumber = null,
    string? Timezone = null
) : IRequest<TenantSettingsDto>;

public record TenantSettingsDto(
    string TenantSlug,
    string Name,
    string? RepresentativeName,
    string? Email,
    string? PhoneNumber,
    string? Timezone
);

public class UpdateTenantSettingsCommandValidator : AbstractValidator<UpdateTenantSettingsCommand>
{
    public UpdateTenantSettingsCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        When(x => !string.IsNullOrEmpty(x.Name), () =>
        {
            RuleFor(x => x.Name).MinimumLength(2).WithMessage("Workspace name must be at least 2 characters.");
        });
        When(x => !string.IsNullOrEmpty(x.Email), () =>
        {
            RuleFor(x => x.Email).EmailAddress().WithMessage("Must be a valid email address.");
        });
    }
}

public class UpdateTenantSettingsCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateTenantSettingsCommand, TenantSettingsDto>
{
    public async Task<TenantSettingsDto> Handle(UpdateTenantSettingsCommand request, CancellationToken cancellationToken)
    {
        var slugLower = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == slugLower || t.Id.ToString() == slugLower, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            tenant.Name = request.Name.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.RepresentativeName))
        {
            var parts = request.RepresentativeName.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            tenant.FirstName = parts.Length > 0 ? parts[0] : "";
            tenant.LastName = parts.Length > 1 ? parts[1] : "";
        }

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            tenant.Email = request.Email.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            tenant.PhoneNumber = request.PhoneNumber.Trim();
        }

        tenant.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        var repName = $"{tenant.FirstName} {tenant.LastName}".Trim();
        return new TenantSettingsDto(
            tenant.TenantSlug,
            tenant.Name,
            string.IsNullOrEmpty(repName) ? null : repName,
            tenant.Email,
            tenant.PhoneNumber,
            request.Timezone ?? "UTC+08:00 Manila, Singapore"
        );
    }
}
