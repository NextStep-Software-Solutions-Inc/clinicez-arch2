using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Records where a facility's service runs (shared cloud or on-premise) and, for on-premise, the
/// https address of its console. The address is only ever used as a browser link, never fetched by the
/// portal, so private/LAN hostnames are allowed (unlike <see cref="PublicHttpsUrl"/>).
/// </summary>
public record UpdateFacilityDeploymentCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid FacilityId,
    FacilityDeploymentMode DeploymentMode,
    string? ConsoleBaseUrl
) : IRequest<FacilityDeploymentDto>;

public record FacilityDeploymentDto(Guid FacilityId, FacilityDeploymentMode DeploymentMode, string? ConsoleBaseUrl);

public static class ConsoleBaseUrlRule
{
    public const int MaxLength = 2048;

    /// <summary>Absolute https URL, no credentials, no query string or fragment.</summary>
    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaxLength) return false;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return false;
        return uri.Scheme == Uri.UriSchemeHttps
               && string.IsNullOrEmpty(uri.UserInfo)
               && string.IsNullOrEmpty(uri.Query)
               && string.IsNullOrEmpty(uri.Fragment);
    }

    /// <summary>Canonical stored form: trimmed, no trailing slash.</summary>
    public static string Normalize(string value) => value.Trim().TrimEnd('/');
}

public class UpdateFacilityDeploymentCommandValidator : AbstractValidator<UpdateFacilityDeploymentCommand>
{
    public UpdateFacilityDeploymentCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.FacilityId).NotEmpty().WithMessage("Facility is required.");
        RuleFor(x => x.DeploymentMode).IsInEnum();

        When(x => x.DeploymentMode == FacilityDeploymentMode.OnPremise, () =>
        {
            RuleFor(x => x.ConsoleBaseUrl).Must(ConsoleBaseUrlRule.IsValid)
                .WithMessage("On-premise facilities need an https:// console address (no credentials, query or fragment).");
        });

        When(x => x.DeploymentMode == FacilityDeploymentMode.SharedCloud, () =>
        {
            RuleFor(x => x.ConsoleBaseUrl).Must(string.IsNullOrWhiteSpace)
                .WithMessage("A custom console address applies to on-premise facilities only.");
        });
    }
}

public class UpdateFacilityDeploymentCommandHandler(IApplicationDbContext context, IHubOnboardingService hubOnboarding)
    : IRequestHandler<UpdateFacilityDeploymentCommand, FacilityDeploymentDto>
{
    public async Task<FacilityDeploymentDto> Handle(UpdateFacilityDeploymentCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var facility = await context.Facilities
            .FirstOrDefaultAsync(f => f.Id == request.FacilityId && f.TenantId == tenant.Id, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("Facility not found in this workspace.");

        var url = request.DeploymentMode == FacilityDeploymentMode.OnPremise
            ? ConsoleBaseUrlRule.Normalize(request.ConsoleBaseUrl!)
            : null;

        var changes = new WorkspaceChangeSet();
        changes.Track($"{facility.Name}.deploymentMode", facility.DeploymentMode.ToString(), request.DeploymentMode.ToString());
        changes.Track($"{facility.Name}.consoleBaseUrl", facility.ConsoleBaseUrl, url);

        var leftEdgeCell = FacilityCells.RequiresHubClient(facility) && request.DeploymentMode == FacilityDeploymentMode.SharedCloud;

        facility.DeploymentMode = request.DeploymentMode;
        facility.ConsoleBaseUrl = url;

        changes.Stage(context, tenant.Id, request.Actor, section: "facilities");
        await context.SaveChangesAsync(cancellationToken);
        if (leftEdgeCell)
        {
            await hubOnboarding.RevokeForFacilityAsync(facility, cancellationToken, leftEdgeCell: true);
        }

        return new FacilityDeploymentDto(facility.Id, facility.DeploymentMode, facility.ConsoleBaseUrl);
    }
}
