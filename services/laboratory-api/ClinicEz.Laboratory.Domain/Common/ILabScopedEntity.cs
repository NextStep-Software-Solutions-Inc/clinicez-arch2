using System;

namespace ClinicEz.Laboratory.Domain.Common;

/// <summary>
/// Data owned by exactly one laboratory facility. Every read is filtered by tenant AND laboratory, and every write is
/// stamped with (or rejected unless it already carries) the tenant and laboratory of the active data scope.
/// </summary>
public interface ILabScopedEntity
{
    string TenantId { get; set; }

    Guid LaboratoryId { get; set; }
}
