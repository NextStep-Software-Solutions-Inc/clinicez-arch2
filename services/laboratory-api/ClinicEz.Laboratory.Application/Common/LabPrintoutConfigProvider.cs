using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Common;

/// <summary>
/// Letterhead from the laboratory's own <see cref="LabSettings"/> (name from provisioning, the rest entered by the
/// lab admin) and the accent from the workspace profile. A blank field stays blank: reports omit the line instead of
/// printing a made-up value.
/// </summary>
public sealed class LabPrintoutConfigProvider(
    IRepository<LabSettings> settingsRepository,
    IWorkspaceProfileProvider? workspaceProfiles = null) : ILabPrintoutConfigProvider
{
    private const string ProductAccent = "#5B21B6";

    public async Task<TenantPrintoutConfig> GetAsync(LabRequisition requisition, CancellationToken ct)
    {
        var settings = await settingsRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.LaboratoryId == requisition.LaboratoryId && !s.IsDeleted, ct);

        var workspace = workspaceProfiles is null ? null : await workspaceProfiles.GetAsync(requisition.TenantId, ct);

        return new TenantPrintoutConfig
        {
            FacilityName = settings?.LaboratoryName ?? string.Empty,
            PhysicalAddress = Clean(settings?.PhysicalAddress),
            ContactNumbers = Clean(settings?.ContactNumbers),
            EmailAndWeb = Clean(settings?.EmailAndWeb),
            DohLicenseToOperate = Clean(settings?.LicenseToOperateNumber),
            PhilHealthAccreditationNumber = Clean(settings?.PhilHealthAccreditationNumber),
            PrimaryColorHex = WorkspaceBrand.ResolveAccent(null, workspace?.AccentColorHex, ProductAccent)
        };
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
