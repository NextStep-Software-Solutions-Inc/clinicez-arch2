using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabResults.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabResults.Queries;

/// <param name="MineOnly">Only results of orders placed by the signed-in doctor (their own patients).</param>
public record GetLabResultReviewQueueQuery(VerificationState State = VerificationState.Unverified, bool MineOnly = true)
    : IRequest<List<LabResultReviewItemDto>>;

public class GetLabResultReviewQueueQueryHandler : IRequestHandler<GetLabResultReviewQueueQuery, List<LabResultReviewItemDto>>
{
    private readonly IRepository<ClinicLabResult> _resultRepo;
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IClinicContext _clinicContext;

    public GetLabResultReviewQueueQueryHandler(
        IRepository<ClinicLabResult> resultRepo,
        IRepository<ClinicLabOrder> orderRepo,
        IClinicContext clinicContext)
    {
        _resultRepo = resultRepo;
        _orderRepo = orderRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<LabResultReviewItemDto>> Handle(GetLabResultReviewQueueQuery request, CancellationToken cancellationToken)
    {
        var results = await _resultRepo.Query(r => r.Verification == request.State)
            .AsNoTracking()
            .OrderByDescending(r => r.SubmittedAt)
            .ToListAsync(cancellationToken);
        if (results.Count == 0) return new List<LabResultReviewItemDto>();

        var orderIds = results.Select(r => r.LabOrderId).Distinct().ToList();
        var staffId = _clinicContext.StaffId;
        var orders = (await _orderRepo.Query(o => orderIds.Contains(o.Id))
                .Include(o => o.Items)
                .AsNoTracking()
                .ToListAsync(cancellationToken))
            .Where(o => !request.MineOnly || (staffId != null && o.OrderedByDoctorId == staffId))
            .ToDictionary(o => o.Id);

        return results
            .Where(r => orders.ContainsKey(r.LabOrderId))
            .Select(r => LabResultReviewItemDto.From(r, orders[r.LabOrderId]))
            .ToList();
    }
}

public record GetLabResultFileQuery(Guid ResultId) : IRequest<LabResultFileDto>;

/// <summary>The report PDF of an order: the latest ClinicEZ-lab result that has a stored file.</summary>
public record GetLabOrderReportFileQuery(Guid OrderId) : IRequest<LabResultFileDto>;

public class GetLabResultFileQueryHandler :
    IRequestHandler<GetLabResultFileQuery, LabResultFileDto>,
    IRequestHandler<GetLabOrderReportFileQuery, LabResultFileDto>
{
    private readonly IRepository<ClinicLabResult> _resultRepo;
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly ILabResultFileStore _files;

    public GetLabResultFileQueryHandler(
        IRepository<ClinicLabResult> resultRepo,
        IRepository<ClinicLabOrder> orderRepo,
        ILabResultFileStore files)
    {
        _resultRepo = resultRepo;
        _orderRepo = orderRepo;
        _files = files;
    }

    public async Task<LabResultFileDto> Handle(GetLabResultFileQuery request, CancellationToken cancellationToken)
    {
        var result = await _resultRepo.Query(r => r.Id == request.ResultId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Lab result '{request.ResultId}' was not found.");

        return await ReadAsync(result, cancellationToken);
    }

    public async Task<LabResultFileDto> Handle(GetLabOrderReportFileQuery request, CancellationToken cancellationToken)
    {
        var exists = await _orderRepo.Query(o => o.Id == request.OrderId).AnyAsync(cancellationToken);
        if (!exists)
        {
            throw new NotFoundException($"Clinic lab order with ID '{request.OrderId}' was not found.");
        }

        var result = await _resultRepo.Query(r => r.LabOrderId == request.OrderId
                                                  && r.Source == ResultSource.ClinicEzLab
                                                  && r.StorageKey != null)
            .AsNoTracking()
            .OrderByDescending(r => r.SubmittedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Official signed PDF report is not yet available for this order.");

        return await ReadAsync(result, cancellationToken);
    }

    private async Task<LabResultFileDto> ReadAsync(ClinicLabResult result, CancellationToken cancellationToken)
    {
        var content = await _files.ReadAsync(result, cancellationToken)
            ?? throw new NotFoundException("This result has no file.");

        return new LabResultFileDto(content, result.ContentType ?? "application/octet-stream", result.FileName ?? $"LabResult-{result.Id:N}");
    }
}
