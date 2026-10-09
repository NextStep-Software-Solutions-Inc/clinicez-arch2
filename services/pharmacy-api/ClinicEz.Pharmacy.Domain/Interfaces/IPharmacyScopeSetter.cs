using System;

namespace ClinicEz.Pharmacy.Domain.Interfaces;

/// <summary>
/// Lets background code that has no HTTP principal (interop message handlers, seeders) enter an explicit
/// tenant + pharmacy scope for the current DI scope. The global query filters then apply to that scope
/// exactly as they do for an authenticated staff request; nothing bypasses them.
/// </summary>
public interface IPharmacyScopeSetter
{
    void Enter(string tenantId, Guid pharmacyId);
}
