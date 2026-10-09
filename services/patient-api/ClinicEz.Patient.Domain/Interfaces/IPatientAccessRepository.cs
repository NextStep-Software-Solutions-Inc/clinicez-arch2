using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

/// <summary>Persistence for the patient's consent records: grants, the audit log and the single-use register of share tokens.</summary>
public interface IPatientAccessRepository
{
    /// <summary>All grants of the patient (active, expired and revoked), newest first.</summary>
    Task<IReadOnlyList<PatientAccessGrant>> GetGrantsAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>A tracked grant that belongs to the patient, or null when it is not theirs.</summary>
    Task<PatientAccessGrant?> GetGrantAsync(Guid patientId, Guid grantId, CancellationToken cancellationToken = default);

    Task AddGrantAsync(PatientAccessGrant grant, CancellationToken cancellationToken = default);

    Task AddLogAsync(PatientAccessLog log, CancellationToken cancellationToken = default);

    /// <summary>One page of the audit log, newest first, optionally limited to a single grant.</summary>
    Task<(IReadOnlyList<PatientAccessLog> Items, int TotalCount)> GetLogAsync(
        Guid patientId, Guid? grantId, int skip, int take, CancellationToken cancellationToken = default);

    Task<ShareTokenUse?> GetTokenUseAsync(string tokenId, CancellationToken cancellationToken = default);

    Task AddTokenUseAsync(ShareTokenUse use, CancellationToken cancellationToken = default);
}