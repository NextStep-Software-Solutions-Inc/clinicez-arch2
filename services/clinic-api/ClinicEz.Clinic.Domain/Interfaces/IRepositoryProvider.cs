using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Interfaces;

/// <summary>
/// Resolves generic <see cref="IRepository{T}"/> instances backed by the active unit-of-work <c>DbContext</c>
/// so transactional cleanup helpers can access all dependent entity sets without requiring callers to wire
/// dozens of optional constructor parameters.
/// </summary>
public interface IRepositoryProvider
{
    IRepository<T> GetRepository<T>() where T : BaseEntity;
}
