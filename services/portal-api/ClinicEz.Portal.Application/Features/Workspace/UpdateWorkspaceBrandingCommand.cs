using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Replaces the whole "branding" section. Blank values clear the override (facilities then fall back
/// to the workspace name / no logo / product theme).
/// </summary>
public record UpdateWorkspaceBrandingCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    string? BrandName,
    string? LogoUrl,
    string? AccentColorHex
) : IRequest<WorkspaceBrandingDto>;

public partial class UpdateWorkspaceBrandingCommandValidator : AbstractValidator<UpdateWorkspaceBrandingCommand>
{
    [GeneratedRegex(@"^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColor();

    public UpdateWorkspaceBrandingCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");

        When(x => !string.IsNullOrWhiteSpace(x.BrandName), () =>
        {
            RuleFor(x => x.BrandName!).Must(n => n.Trim().Length is >= 2 and <= 120)
                .WithMessage("Display name must be between 2 and 120 characters.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.LogoUrl), () =>
        {
            RuleFor(x => x.LogoUrl!).Must(PublicHttpsUrl.IsValid)
                .WithMessage("Logo must be a public https:// URL (max 2048 characters).");
        });

        When(x => !string.IsNullOrWhiteSpace(x.AccentColorHex), () =>
        {
            RuleFor(x => x.AccentColorHex!).Must(c => HexColor().IsMatch(c.Trim()))
                .WithMessage("Accent color must be a hex value like #0284C7.");
        });
    }
}

public class UpdateWorkspaceBrandingCommandHandler(IApplicationDbContext context, IPublishEndpoint publishEndpoint)
    : IRequestHandler<UpdateWorkspaceBrandingCommand, WorkspaceBrandingDto>
{
    public async Task<WorkspaceBrandingDto> Handle(UpdateWorkspaceBrandingCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        var changes = new WorkspaceChangeSet();

        var brandName = Normalize(request.BrandName);
        var logoUrl = Normalize(request.LogoUrl);
        var accent = Normalize(request.AccentColorHex)?.ToUpperInvariant();

        changes.Track("brandName", settings.BrandName, brandName);
        changes.Track("logoUrl", settings.LogoUrl, logoUrl);
        changes.Track("accentColorHex", settings.AccentColorHex, accent);

        settings.BrandName = brandName;
        settings.LogoUrl = logoUrl;
        settings.AccentColorHex = accent;

        if (changes.HasChanges)
        {
            WorkspaceSettingsStore.BumpProfileVersion(settings);
            changes.Stage(context, tenant.Id, request.Actor, section: "branding");
        }

        await context.SaveChangesAsync(cancellationToken);

        if (changes.HasChanges) await WorkspaceProfileEvents.PublishUpdatedAsync(publishEndpoint, tenant, settings, cancellationToken);

        return WorkspaceSettingsMapper.ToBranding(settings);
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
