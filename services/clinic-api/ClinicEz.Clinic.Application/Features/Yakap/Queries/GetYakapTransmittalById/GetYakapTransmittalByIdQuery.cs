using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalById;

public sealed record GetYakapTransmittalByIdQuery(Guid Id) : IRequest<ApiResponse<YakapTransmittalDto>>;

public sealed class GetYakapTransmittalByIdQueryHandler : IRequestHandler<GetYakapTransmittalByIdQuery, ApiResponse<YakapTransmittalDto>>
{
    private readonly IRepository<YakapTransmittal> _transmittalRepo;

    public GetYakapTransmittalByIdQueryHandler(IRepository<YakapTransmittal> transmittalRepo)
    {
        _transmittalRepo = transmittalRepo;
    }

    public async Task<ApiResponse<YakapTransmittalDto>> Handle(
        GetYakapTransmittalByIdQuery request,
        CancellationToken cancellationToken)
    {
        var transmittal = await _transmittalRepo.Query(t => t.Id == request.Id)
            .Include(t => t.Items)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        if (transmittal == null)
        {
            return ApiResponse<YakapTransmittalDto>.Fail("Yakap transmittal not found.");
        }

        var dto = new YakapTransmittalDto(
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
                DeficiencyRemarks: i.DeficiencyRemarks)).ToList());

        return ApiResponse<YakapTransmittalDto>.Success(dto);
    }
}
