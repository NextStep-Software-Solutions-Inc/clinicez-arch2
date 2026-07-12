using MainPortalBE.Domain.Common;
using System.Collections.Generic;

namespace MainPortalBE.Domain.Entities;

public class AdminRole : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Permissions { get; set; } = new();
}
