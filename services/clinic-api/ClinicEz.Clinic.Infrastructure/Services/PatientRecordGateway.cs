using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientRecordGateway : IPatientRecordGateway
{
    private readonly ApplicationDbContext _db;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IInteropPublisher _publisher;

    public PatientRecordGateway(
        ApplicationDbContext db,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        IInteropPublisher publisher)
    {
        _db = db;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _publisher = publisher;
    }

    public async Task<Guid> RequestRedeemAsync(PatientShareRedeemInput input, CancellationToken ct)
    {
        var clinic = await _clinicIdentity.GetAsync(ct)
            ?? throw new BadRequestException("This clinic has not been provisioned on this server, so it cannot read a shared patient record.");

        var requestId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        _db.ShareImports.Add(new ShareImport
        {
            Id = requestId,
            TenantId = clinic.TenantId,
            ClinicId = clinic.ClinicId,
            RequestedByStaffId = _clinicContext.StaffId,
            Purpose = input.Purpose,
            AddToQueue = input.AddToQueue,
            ChiefComplaint = input.ChiefComplaint,
            Status = ShareImportStatus.Pending,
            RequestedAt = now,
            CreatedAt = now,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "system"
        });

        _publisher.Enqueue(
            InteropTypes.PatientShareRedeem,
            ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            requestId,
            new PatientShareRedeemPayload
            {
                ShareToken = input.ShareToken,
                ClinicEzId = input.ClinicEzId,
                Code = input.Code,
                Purpose = input.Purpose
            });

        return requestId;
    }
}
