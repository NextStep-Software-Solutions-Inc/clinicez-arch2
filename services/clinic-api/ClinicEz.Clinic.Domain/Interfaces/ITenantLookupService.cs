using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Domain.Interfaces;

public record TenantLookupDto(Guid Id, string Slug, string Name, Guid? FacilityId = null, string? FacilitySlug = null);

public interface ITenantLookupService
{
    Task<TenantLookupDto?> LookupAsync(string identifier, CancellationToken ct = default);
}
