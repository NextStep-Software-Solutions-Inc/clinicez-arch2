using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Creates the hub claim for a requisition or prescription the patient carries to a laboratory/pharmacy. The claim token
/// printed on the slip lets any ClinicEZ facility of that type take the order; the issuer is the clinic, the patient
/// is the consent broker.
/// </summary>
public interface IClaimSlipService
{
    Task<ClaimSlipResult> CreateLabClaimAsync(LabRequisitionIssuedEvent requisition, CancellationToken ct);

    Task<ClaimSlipResult> CreateRxClaimAsync(PrescriptionIssuedEvent prescription, CancellationToken ct);
}
