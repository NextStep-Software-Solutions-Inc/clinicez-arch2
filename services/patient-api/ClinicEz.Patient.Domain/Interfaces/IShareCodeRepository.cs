using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

/// <summary>Persistence for manual share codes and the failed attempts that throttle guessing them.</summary>
public interface IShareCodeRepository
{
    Task AddAsync(ShareCode code, CancellationToken cancellationToken = default);

    /// <summary>The patient's code with this hash, or null.</summary>
    Task<ShareCode?> FindAsync(Guid patientId, string codeHash, CancellationToken cancellationToken = default);

    /// <summary>Codes of the patient that have neither expired nor been redeemed.</summary>
    Task<int> CountLiveAsync(Guid patientId, DateTime utcNow, CancellationToken cancellationToken = default);

    Task AddFailureAsync(ShareCodeFailure failure, CancellationToken cancellationToken = default);

    Task<int> CountFailuresByActorAsync(string actor, DateTime since, CancellationToken cancellationToken = default);

    Task<int> CountFailuresByPatientAsync(Guid patientId, DateTime since, CancellationToken cancellationToken = default);
}
