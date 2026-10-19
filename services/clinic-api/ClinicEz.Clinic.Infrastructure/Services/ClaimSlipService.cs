using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClaimSlipService : IClaimSlipService
{
    private readonly IHubClaimsClient _claims;

    public ClaimSlipService(IHubClaimsClient claims) => _claims = claims;

    public Task<ClaimSlipResult> CreateLabClaimAsync(LabRequisitionIssuedEvent requisition, CancellationToken ct) =>
        _claims.CreateAsync(
            new ClaimSlipRequest(InteropEnvelope.Create(
                InteropTypes.LabOrderIssued,
                ClinicParties.Clinic(requisition.TenantId, requisition.OrderingFacilityId),
                ByFacilityType(FacilityType.Laboratory),
                requisition.RequisitionId,
                requisition)),
            ct);

    public Task<ClaimSlipResult> CreateRxClaimAsync(PrescriptionIssuedEvent prescription, CancellationToken ct) =>
        _claims.CreateAsync(
            new ClaimSlipRequest(InteropEnvelope.Create(
                InteropTypes.RxIssued,
                ClinicParties.Clinic(prescription.TenantId, prescription.OrderingFacilityId),
                ByFacilityType(FacilityType.Pharmacy),
                prescription.PrescriptionId,
                prescription)),
            ct);

    /// <summary>Addressed by facility TYPE only: whichever facility of that type the patient hands the slip to redeems it.</summary>
    private static Party ByFacilityType(FacilityType type) => new() { Kind = PartyKind.Facility, FacilityType = type };
}
