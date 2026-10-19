using System;

namespace ClinicEz.Clinic.Domain.Interfaces;

/// <summary>
/// Sets the ambient clinic scope for background consumers, Interop message handlers and responders (where no HTTP request exists).
/// Scope entered here overrides the configuration fallbacks for the lifetime of the scope.
/// </summary>
public interface IClinicScopeSetter
{
    void Enter(string tenantId, Guid clinicId, Guid? branchId = null);
}
