using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public sealed record PatientCodeReservation(int Sequence, string PatientCode);

public sealed record PatientCodeRangeReservation(int StartSequence, int EndSequence, IReadOnlyList<string> PatientCodes);

public interface IPatientCodeGenerator
{
    Task<string> GenerateNextCodeAsync(
        string tenantId,
        Guid clinicId,
        int? year = null,
        CancellationToken ct = default);

    Task<PatientCodeReservation> ReserveNextAsync(
        string tenantId,
        Guid clinicId,
        int? year = null,
        CancellationToken ct = default);

    Task<IReadOnlyList<string>> ReserveBatchCodesAsync(
        string tenantId,
        Guid clinicId,
        int count,
        int? year = null,
        CancellationToken ct = default);

    Task<PatientCodeRangeReservation> ReserveRangeAsync(
        string tenantId,
        Guid clinicId,
        int count,
        int? year = null,
        CancellationToken ct = default);
}
