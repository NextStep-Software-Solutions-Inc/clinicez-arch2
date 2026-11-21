using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class LabResultReviewedPublisher : ILabResultReviewedPublisher
{
    private readonly ClinicPatientAddressResolver _addresses;
    private readonly IInteropPublisher _publisher;

    public LabResultReviewedPublisher(ClinicPatientAddressResolver addresses, IInteropPublisher publisher)
    {
        _addresses = addresses;
        _publisher = publisher;
    }

    public async Task PublishAsync(LabOrder order, LabResultReviewedPayload review, CancellationToken ct)
    {
        var address = await _addresses.ResolveAsync(order.ClinicId, order.PatientId, ct);

        // A lab result only reaches a laboratory that is known: the one the order was routed to, or that reported on it.
        var labTenant = order.LaboratoryTenantId ?? order.TargetTenantId;
        var labFacility = order.LaboratoryFacilityId ?? order.TargetFacilityId?.ToString();
        if (!string.IsNullOrWhiteSpace(labTenant) && !string.IsNullOrWhiteSpace(order.TenantId)
            && Guid.TryParse(labFacility, out var labFacilityId))
        {
            _publisher.Enqueue(
                InteropTypes.LabResultReviewed,
                ClinicParties.Clinic(order.TenantId, order.ClinicId.ToString()),
                Party.ForFacility(labTenant, labFacilityId.ToString(), FacilityType.Laboratory),
                order.Id,
                review);
        }

        if (address != null)
        {
            _publisher.Enqueue(
                InteropTypes.LabResultReviewed,
                address.From,
                address.To,
                order.Id,
                review with { PatientId = address.SyncPatientId });
        }
    }
}
