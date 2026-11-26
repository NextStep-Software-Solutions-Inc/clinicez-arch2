using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientLinkResolutionPublisher : IPatientLinkResolutionPublisher
{
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IInteropPublisher _publisher;

    public PatientLinkResolutionPublisher(
        IClinicIdentityProvider clinicIdentity,
        IInteropPublisher publisher)
    {
        _clinicIdentity = clinicIdentity;
        _publisher = publisher;
    }

    public async Task PublishResolvedAsync(
        Guid linkRequestId,
        Guid cloudPatientId,
        string clinicEzId,
        Guid? clinicPatientId,
        string status,
        string? rejectionReason,
        string? reviewedByStaffName,
        CancellationToken ct)
    {
        var clinic = await _clinicIdentity.GetAsync(ct);
        if (clinic is null) return;

        _publisher.Enqueue(
            InteropTypes.ClinicLinkResolved,
            ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
            Party.ForPatient(cloudPatientId.ToString()),
            linkRequestId,
            new ClinicLinkResolvedPayload
            {
                LinkRequestId = linkRequestId,
                PatientId = cloudPatientId,
                ClinicEzId = clinicEzId,
                TenantId = clinic.TenantId,
                ClinicId = clinic.ClinicId,
                ClinicPatientId = clinicPatientId,
                Status = status,
                RejectionReason = rejectionReason,
                ReviewedByStaffName = reviewedByStaffName,
                ResolvedAtUtc = DateTime.UtcNow
            });
    }
}
