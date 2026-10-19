using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittals;

public sealed record GetYakapTransmittalsQuery(
    YakapTransmittalStatus? Status = null,
    string? ReportTagging = null,
    Guid? BranchId = null) : IRequest<ApiResponse<IReadOnlyList<YakapTransmittalDto>>>;

public sealed class GetYakapTransmittalsQueryHandler : IRequestHandler<GetYakapTransmittalsQuery, ApiResponse<IReadOnlyList<YakapTransmittalDto>>>
{
    private readonly IRepository<YakapTransmittal> _transmittalRepo;

    public GetYakapTransmittalsQueryHandler(IRepository<YakapTransmittal> transmittalRepo)
    {
        _transmittalRepo = transmittalRepo;
    }

    public async Task<ApiResponse<IReadOnlyList<YakapTransmittalDto>>> Handle(
        GetYakapTransmittalsQuery request,
        CancellationToken cancellationToken)
    {
        var query = _transmittalRepo.Query()
            .Include(t => t.Items)
            .AsNoTracking();

        if (request.Status.HasValue)
        {
            query = query.Where(t => t.Status == request.Status.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.ReportTagging))
        {
            query = query.Where(t => t.ReportTagging == request.ReportTagging);
        }

        if (request.BranchId.HasValue)
        {
            query = query.Where(t => t.BranchId == request.BranchId.Value);
        }

        var list = await query
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);

        var dtos = list.Select(transmittal => new YakapTransmittalDto(
            Id: transmittal.Id,
            TransmittalNumber: transmittal.TransmittalNumber,
            ReportTagging: transmittal.ReportTagging,
            EffectiveYear: transmittal.EffectiveYear,
            PackageType: transmittal.PackageType,
            Status: transmittal.Status,
            PhilHealthTransactionNumber: transmittal.PhilHealthTransactionNumber,
            EncryptedPayloadHash: transmittal.EncryptedPayloadHash,
            ValidationErrors: transmittal.ValidationErrors,
            SubmittedAt: transmittal.SubmittedAt,
            SubmittedBy: transmittal.SubmittedBy,
            CreatedAt: transmittal.CreatedAt,
            TotalItemsCount: transmittal.Items.Count,
            Items: transmittal.Items.Select(i => new YakapTransmittalItemDto(
                Id: i.Id,
                YakapTransmittalId: i.YakapTransmittalId,
                PatientId: i.PatientId,
                PatientName: i.PatientName,
                PhilHealthIdentificationNumber: i.PhilHealthIdentificationNumber,
                ConsultationEncounterId: i.ConsultationEncounterId,
                EncounterDate: i.EncounterDate,
                ItemType: i.ItemType,
                ReportStatus: i.ReportStatus,
                DeficiencyRemarks: i.DeficiencyRemarks)).ToList(),
            BranchId: transmittal.BranchId)).ToList();

        return ApiResponse<IReadOnlyList<YakapTransmittalDto>>.Success(dtos);
    }
}
