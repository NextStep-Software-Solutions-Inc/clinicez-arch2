using System;

namespace ClinicEz.Comms.Application.Models;

public sealed record TenantMigrationStatusDto(
    string TenantId,
    bool IsMoving,
    string MigrationState,
    string TargetCellType,
    string Message);
