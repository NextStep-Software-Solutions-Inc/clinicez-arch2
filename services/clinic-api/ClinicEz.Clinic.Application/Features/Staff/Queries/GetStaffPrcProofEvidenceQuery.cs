using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Queries;

public sealed record GetStaffPrcProofEvidenceQuery(Guid StaffId) : IRequest<VerificationEvidenceFileResult?>;

public sealed class GetStaffPrcProofEvidenceQueryHandler : IRequestHandler<GetStaffPrcProofEvidenceQuery, VerificationEvidenceFileResult?>
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicStorageService _storageService;
    private readonly IClinicEncryptionService? _encryptionService;

    public GetStaffPrcProofEvidenceQueryHandler(
        IRepository<StaffMember> staffRepo,
        IClinicContext clinicContext,
        IClinicStorageService storageService,
        IClinicEncryptionService? encryptionService = null)
    {
        _staffRepo = staffRepo;
        _clinicContext = clinicContext;
        _storageService = storageService;
        _encryptionService = encryptionService;
    }

    public async Task<VerificationEvidenceFileResult?> Handle(GetStaffPrcProofEvidenceQuery request, CancellationToken ct)
    {
        var staff = await _staffRepo
            .Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (staff == null || string.IsNullOrWhiteSpace(staff.PrcEvidenceObjectKey))
        {
            return null;
        }

        return await VerificationEvidenceHelper.ReadDecryptedEvidenceAsync(
            _storageService,
            _encryptionService,
            staff.TenantId,
            staff.ClinicId,
            staff.PrcEvidenceObjectKey,
            ct);
    }
}
