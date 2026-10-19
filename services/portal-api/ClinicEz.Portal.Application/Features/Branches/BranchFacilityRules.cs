using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Branches;

/// <summary>A branch is one physical location: it can host at most one facility of each type, and only of its own workspace.</summary>
public static class BranchFacilityRules
{
    /// <summary>
    /// Verifies the facilities may be attached to the branch. Throws <see cref="CodedConflictException"/> with
    /// <see cref="ConflictCodes.BranchFacilityTypeTaken"/> when two facilities of the same type would share the branch.
    /// </summary>
    public static async Task EnsureCanLinkAsync(
        IApplicationDbContext context,
        Branch branch,
        IReadOnlyCollection<Facility> facilitiesToLink,
        CancellationToken cancellationToken)
    {
        if (facilitiesToLink.Any(f => f.TenantId != branch.TenantId))
        {
            throw new ForbiddenException("A facility can only join a branch of its own workspace.");
        }

        var linkingIds = facilitiesToLink.Select(f => f.Id).ToList();
        var occupiedTypes = await context.Facilities
            .Where(f => f.BranchId == branch.Id && !linkingIds.Contains(f.Id) && !f.IsDeleted)
            .Select(f => f.FacilityType)
            .ToListAsync(cancellationToken);

        var seen = new HashSet<FacilityType>(occupiedTypes);
        foreach (var facility in facilitiesToLink)
        {
            if (!seen.Add(facility.FacilityType))
            {
                throw new CodedConflictException(
                    ConflictCodes.BranchFacilityTypeTaken,
                    $"This branch already has a {facility.FacilityType.ToString().ToLowerInvariant()}.");
            }
        }
    }
}
