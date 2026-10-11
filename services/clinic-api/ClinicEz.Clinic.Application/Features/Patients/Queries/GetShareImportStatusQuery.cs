using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetShareImportStatusQuery(Guid CorrelationId) : IRequest<ShareImportStatusDto>;

public sealed class GetShareImportStatusQueryHandler : IRequestHandler<GetShareImportStatusQuery, ShareImportStatusDto>
{
    private readonly IRepository<ShareImport> _importRepo;

    public GetShareImportStatusQueryHandler(IRepository<ShareImport> importRepo)
    {
        _importRepo = importRepo;
    }

    public async Task<ShareImportStatusDto> Handle(GetShareImportStatusQuery request, CancellationToken cancellationToken)
    {
        var import = await _importRepo.Query(i => i.Id == request.CorrelationId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Share import not found.");

        return ShareImportStatusDto.From(import);
    }
}
