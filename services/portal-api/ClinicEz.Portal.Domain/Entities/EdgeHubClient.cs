using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// A hub client issued to a workspace's on-premise (edge) cell: the one upstream client the local hub uses to reach the
/// cloud hub (<see cref="Service"/> = <c>cell</c>), plus one client per facility service running on site. The hub keeps
/// only a hash of each secret, so the portal remembers just the client id to rotate or revoke it later.
/// </summary>
public class EdgeHubClient : BaseEntity
{
    public Guid TenantId { get; set; }
    public string CellId { get; set; } = string.Empty;

    /// <summary><c>cell</c> for the upstream client, otherwise the facility service name (clinic, laboratory, ...).</summary>
    public string Service { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
}
