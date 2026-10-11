using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Links;

/// <summary>
/// A cross-tenant link as one workspace sees it. <see cref="Direction"/> is <c>outgoing</c> when the workspace's own
/// facility is the requester (source) and <c>incoming</c> when its facility is the one being asked (target).
/// </summary>
public record FacilityLinkDto(
    Guid Id,
    string Direction,
    string Status,
    IReadOnlyList<string> Scopes,
    Guid SourceFacilityId,
    string SourceFacilityName,
    string? SourceCity,
    Guid TargetFacilityId,
    string TargetFacilityName,
    string? TargetCity,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public record FacilityVisibilityDto(Guid FacilityId, string Visibility, bool AcceptsExternalRequests);

internal static class FacilityLinkSupport
{
    public static async Task<Tenant> ResolveTenantAsync(IApplicationDbContext context, string tenantSlug, CancellationToken cancellationToken)
    {
        var key = tenantSlug.Trim().ToLowerInvariant();
        return await context.Tenants.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
               ?? throw new NotFoundException($"Workspace '{tenantSlug}' not found.");
    }

    public static IReadOnlyList<string> ScopeNames(LinkScopes scopes) =>
        Enum.GetValues<LinkScopes>()
            .Where(s => s != LinkScopes.None && s != LinkScopes.All && scopes.HasFlag(s))
            .Select(s => s.ToString())
            .ToList();

    public static LinkScopes NormalizeScopes(LinkScopes requested)
    {
        var scopes = requested == LinkScopes.None ? LinkScopes.All : requested & LinkScopes.All;
        return scopes == LinkScopes.None
            ? throw new BadRequestException("Choose at least one valid link scope.")
            : scopes;
    }

    public static FacilityLinkDto ToDto(FacilityLink link, Guid viewerTenantId, IReadOnlyDictionary<Guid, Facility> facilities)
    {
        facilities.TryGetValue(link.SourceFacilityId, out var source);
        facilities.TryGetValue(link.TargetFacilityId, out var target);

        return new FacilityLinkDto(
            link.Id,
            link.SourceTenantId == viewerTenantId ? "outgoing" : "incoming",
            link.Status.ToString(),
            ScopeNames(link.Scopes),
            link.SourceFacilityId,
            source?.Name ?? string.Empty,
            source?.City,
            link.TargetFacilityId,
            target?.Name ?? string.Empty,
            target?.City,
            link.CreatedAt,
            link.UpdatedAt);
    }

    public static async Task<FacilityLinkDto> LoadDtoAsync(IApplicationDbContext context, FacilityLink link, Guid viewerTenantId, CancellationToken cancellationToken)
    {
        var ids = new[] { link.SourceFacilityId, link.TargetFacilityId };
        var facilities = await context.Facilities.IgnoreQueryFilters().AsNoTracking()
            .Where(f => ids.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id, cancellationToken);
        return ToDto(link, viewerTenantId, facilities);
    }

    public static void Audit(IApplicationDbContext context, Tenant tenant, WorkspaceActor actor, FacilityLink link, LinkStatus? before, string action)
    {
        var changes = new WorkspaceChangeSet();
        changes.Track("status", before?.ToString(), link.Status.ToString());
        changes.Track("sourceFacilityId", (Guid?)null, link.SourceFacilityId);
        changes.Track("targetFacilityId", (Guid?)null, link.TargetFacilityId);
        changes.Stage(context, tenant.Id, actor, section: "links", action: action);
    }
}

/// <summary>
/// Facility links of a deleted facility end with it: every pending or active link it takes part in is revoked so
/// the hub stops routing to or from it.
/// </summary>
public static class FacilityLinkLifecycle
{
    public static async Task RevokeAllForFacilityAsync(IApplicationDbContext context, Guid facilityId, CancellationToken cancellationToken)
    {
        var links = await context.FacilityLinks
            .Where(l => (l.SourceFacilityId == facilityId || l.TargetFacilityId == facilityId)
                        && (l.Status == LinkStatus.Pending || l.Status == LinkStatus.Active))
            .ToListAsync(cancellationToken);

        foreach (var link in links)
        {
            link.Status = LinkStatus.Revoked;
        }
    }
}

/// <summary>Asks another workspace's public facility for a link. Requires the cross-tenant interop feature on the requesting workspace.</summary>
public record RequestFacilityLinkCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid SourceFacilityId,
    Guid TargetFacilityId,
    LinkScopes Scopes) : IRequest<FacilityLinkDto>;

/// <summary>
/// The link starts Active when the target facility is public and accepts external requests (it already agreed to be
/// asked), otherwise Pending until an admin of the target's workspace approves it.
/// </summary>
public class RequestFacilityLinkCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard) : IRequestHandler<RequestFacilityLinkCommand, FacilityLinkDto>
{
    public async Task<FacilityLinkDto> Handle(RequestFacilityLinkCommand request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        await entitlementGuard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureCrossTenantInterop, cancellationToken);

        var source = await context.Facilities.FirstOrDefaultAsync(f => f.Id == request.SourceFacilityId && f.TenantId == tenant.Id, cancellationToken)
                     ?? throw new NotFoundException("The requesting facility was not found in this workspace.");
        if (!FacilityCells.IsRoutable(source))
        {
            throw new ConflictException("The requesting facility is not active.");
        }

        var target = await context.Facilities.FirstOrDefaultAsync(f => f.Id == request.TargetFacilityId, cancellationToken);
        if (target is null || target.TenantId == tenant.Id)
        {
            throw target is null
                ? new NotFoundException("The facility was not found or is not accepting link requests.")
                : new BadRequestException("Facilities of one workspace are connected through branches, not link requests.");
        }

        // A facility that is not public is not discoverable, so it must not reveal that it exists.
        if (target.Visibility != FacilityVisibility.Public || !FacilityCells.IsRoutable(target))
        {
            throw new NotFoundException("The facility was not found or is not accepting link requests.");
        }

        var scopes = FacilityLinkSupport.NormalizeScopes(request.Scopes);
        var status = target.AcceptsExternalRequests ? LinkStatus.Active : LinkStatus.Pending;

        var link = await context.FacilityLinks.FirstOrDefaultAsync(
            l => l.SourceFacilityId == source.Id && l.TargetFacilityId == target.Id, cancellationToken);

        LinkStatus? before = null;
        if (link is null)
        {
            link = new FacilityLink
            {
                Id = DirectoryPayloads.LinkId(source.Id, target.Id),
                SourceFacilityId = source.Id,
                SourceTenantId = source.TenantId,
                TargetFacilityId = target.Id,
                TargetTenantId = target.TenantId
            };
            context.FacilityLinks.Add(link);
        }
        else if (link.Status is LinkStatus.Pending or LinkStatus.Active)
        {
            throw new CodedConflictException(ConflictCodes.LinkAlreadyExists, "These facilities already have a pending or active link.");
        }
        else
        {
            before = link.Status;
        }

        link.Status = status;
        link.Scopes = scopes;
        link.RequestedBy = request.Actor.UserId;
        link.ApprovedBy = status == LinkStatus.Active ? FacilityLinkApprovers.AutoAccept : null;

        FacilityLinkSupport.Audit(context, tenant, request.Actor, link, before, "requested");
        await context.SaveChangesAsync(cancellationToken);

        return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
    }
}

/// <summary>Marker stored in <see cref="FacilityLink.ApprovedBy"/> when the target facility accepted requests in advance.</summary>
public static class FacilityLinkApprovers
{
    public const string AutoAccept = "auto-accept";
}

/// <summary>An admin of the target's workspace accepts a pending request, optionally narrowing its scopes.</summary>
public record ApproveFacilityLinkCommand(string TenantSlug, WorkspaceActor Actor, Guid LinkId, LinkScopes? Scopes) : IRequest<FacilityLinkDto>;

public class ApproveFacilityLinkCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard) : IRequestHandler<ApproveFacilityLinkCommand, FacilityLinkDto>
{
    public async Task<FacilityLinkDto> Handle(ApproveFacilityLinkCommand request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        var link = await context.FacilityLinks.FirstOrDefaultAsync(l => l.Id == request.LinkId && l.TargetTenantId == tenant.Id, cancellationToken)
                   ?? throw new NotFoundException("Link request not found.");

        if (link.Status == LinkStatus.Active)
        {
            return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
        }

        if (link.Status != LinkStatus.Pending)
        {
            throw new CodedConflictException(ConflictCodes.LinkNotPending, $"This link request is {link.Status.ToString().ToLowerInvariant()} and can no longer be approved.");
        }

        await entitlementGuard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureCrossTenantInterop, cancellationToken);

        if (request.Scopes is { } narrowed)
        {
            var scopes = FacilityLinkSupport.NormalizeScopes(narrowed);
            if ((scopes & ~link.Scopes) != LinkScopes.None)
            {
                throw new BadRequestException("An approval can only narrow the scopes that were requested.");
            }

            link.Scopes = scopes;
        }

        link.Status = LinkStatus.Active;
        link.ApprovedBy = request.Actor.UserId;

        FacilityLinkSupport.Audit(context, tenant, request.Actor, link, LinkStatus.Pending, "approved");
        await context.SaveChangesAsync(cancellationToken);

        return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
    }
}

/// <summary>An admin of the target's workspace declines a pending request.</summary>
public record RejectFacilityLinkCommand(string TenantSlug, WorkspaceActor Actor, Guid LinkId) : IRequest<FacilityLinkDto>;

public class RejectFacilityLinkCommandHandler(IApplicationDbContext context) : IRequestHandler<RejectFacilityLinkCommand, FacilityLinkDto>
{
    public async Task<FacilityLinkDto> Handle(RejectFacilityLinkCommand request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        var link = await context.FacilityLinks.FirstOrDefaultAsync(l => l.Id == request.LinkId && l.TargetTenantId == tenant.Id, cancellationToken)
                   ?? throw new NotFoundException("Link request not found.");

        if (link.Status == LinkStatus.Rejected)
        {
            return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
        }

        if (link.Status != LinkStatus.Pending)
        {
            throw new CodedConflictException(ConflictCodes.LinkNotPending, $"This link request is {link.Status.ToString().ToLowerInvariant()} and can no longer be rejected.");
        }

        link.Status = LinkStatus.Rejected;
        FacilityLinkSupport.Audit(context, tenant, request.Actor, link, LinkStatus.Pending, "rejected");
        await context.SaveChangesAsync(cancellationToken);

        return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
    }
}

/// <summary>Either side ends a link: the requester withdraws it, the target cuts it off. Never gated by the plan.</summary>
public record RevokeFacilityLinkCommand(string TenantSlug, WorkspaceActor Actor, Guid LinkId) : IRequest<FacilityLinkDto>;

public class RevokeFacilityLinkCommandHandler(IApplicationDbContext context) : IRequestHandler<RevokeFacilityLinkCommand, FacilityLinkDto>
{
    public async Task<FacilityLinkDto> Handle(RevokeFacilityLinkCommand request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        var link = await context.FacilityLinks.FirstOrDefaultAsync(
                       l => l.Id == request.LinkId && (l.SourceTenantId == tenant.Id || l.TargetTenantId == tenant.Id), cancellationToken)
                   ?? throw new NotFoundException("Link not found.");

        if (link.Status == LinkStatus.Revoked)
        {
            return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
        }

        if (link.Status == LinkStatus.Rejected)
        {
            throw new CodedConflictException(ConflictCodes.LinkNotPending, "A rejected link request has nothing to revoke.");
        }

        var before = link.Status;
        link.Status = LinkStatus.Revoked;
        FacilityLinkSupport.Audit(context, tenant, request.Actor, link, before, "revoked");
        await context.SaveChangesAsync(cancellationToken);

        return await FacilityLinkSupport.LoadDtoAsync(context, link, tenant.Id, cancellationToken);
    }
}

/// <summary>Every cross-tenant link the workspace takes part in, in either direction.</summary>
public record GetFacilityLinksQuery(string TenantSlug) : IRequest<IReadOnlyList<FacilityLinkDto>>;

public class GetFacilityLinksQueryHandler(IApplicationDbContext context) : IRequestHandler<GetFacilityLinksQuery, IReadOnlyList<FacilityLinkDto>>
{
    public async Task<IReadOnlyList<FacilityLinkDto>> Handle(GetFacilityLinksQuery request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var links = await context.FacilityLinks.AsNoTracking()
            .Where(l => l.SourceTenantId == tenant.Id || l.TargetTenantId == tenant.Id)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync(cancellationToken);

        var ids = links.SelectMany(l => new[] { l.SourceFacilityId, l.TargetFacilityId }).Distinct().ToList();
        var facilities = await context.Facilities.IgnoreQueryFilters().AsNoTracking()
            .Where(f => ids.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id, cancellationToken);

        return links.Select(l => FacilityLinkSupport.ToDto(l, tenant.Id, facilities)).ToList();
    }
}

/// <summary>
/// Changes who may find and address a facility. Anything above Private, and accepting external requests, needs the
/// cross-tenant interop feature; going back to Private is always allowed. Existing links are left as they are.
/// </summary>
public record SetFacilityVisibilityCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid FacilityId,
    FacilityVisibility Visibility,
    bool AcceptsExternalRequests) : IRequest<FacilityVisibilityDto>;

public class SetFacilityVisibilityCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard) : IRequestHandler<SetFacilityVisibilityCommand, FacilityVisibilityDto>
{
    public async Task<FacilityVisibilityDto> Handle(SetFacilityVisibilityCommand request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == request.FacilityId && f.TenantId == tenant.Id, cancellationToken)
                       ?? throw new NotFoundException("Facility not found.");

        if (request.AcceptsExternalRequests && request.Visibility != FacilityVisibility.Public)
        {
            throw new BadRequestException("Only a public facility can accept external requests.");
        }

        if (request.Visibility != FacilityVisibility.Private)
        {
            await entitlementGuard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureCrossTenantInterop, cancellationToken);
        }

        var changes = new WorkspaceChangeSet();
        changes.Track("visibility", facility.Visibility.ToString(), request.Visibility.ToString());
        changes.Track("acceptsExternalRequests", facility.AcceptsExternalRequests, request.AcceptsExternalRequests);
        changes.Stage(context, tenant.Id, request.Actor, section: "facilities", action: "visibility-updated");

        facility.Visibility = request.Visibility;
        facility.AcceptsExternalRequests = request.AcceptsExternalRequests;
        facility.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        return new FacilityVisibilityDto(facility.Id, facility.Visibility.ToString(), facility.AcceptsExternalRequests);
    }
}

/// <summary>Searches the hub directory as this workspace: its own facilities, public ones, and those it is linked to.</summary>
public record SearchDirectoryQuery(string TenantSlug, DirectorySearchCriteria Criteria) : IRequest<IReadOnlyList<DirectoryFacilityDto>>;

public class SearchDirectoryQueryHandler(
    IApplicationDbContext context,
    IHubDirectoryClient directory) : IRequestHandler<SearchDirectoryQuery, IReadOnlyList<DirectoryFacilityDto>>
{
    public async Task<IReadOnlyList<DirectoryFacilityDto>> Handle(SearchDirectoryQuery request, CancellationToken cancellationToken)
    {
        var tenant = await FacilityLinkSupport.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);
        return await directory.SearchFacilitiesAsync(tenant.Id, request.Criteria, cancellationToken);
    }
}
