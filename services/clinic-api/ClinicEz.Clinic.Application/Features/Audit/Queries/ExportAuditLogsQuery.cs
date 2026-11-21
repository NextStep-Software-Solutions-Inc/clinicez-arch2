namespace ClinicEz.Clinic.Application.Features.Audit.Queries;

using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

public sealed record ExportAuditLogsQuery(
    string Format = "csv",
    string? Category = null,
    string? Severity = null,
    string? Action = null,
    Guid? ActorId = null,
    string? EntityId = null,
    string? Search = null,
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    int Limit = 5000) : IRequest<AuditExportResultDto>;

public sealed class ExportAuditLogsQueryValidator : AbstractValidator<ExportAuditLogsQuery>
{
    public ExportAuditLogsQueryValidator()
    {
        RuleFor(x => x.Format)
            .Must(f => f.Equals("csv", StringComparison.OrdinalIgnoreCase) || f.Equals("json", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Export format must be 'csv' or 'json'.");

        RuleFor(x => x.Limit)
            .InclusiveBetween(1, 10000)
            .WithMessage("Export row limit must be between 1 and 10,000.");

        When(x => x.StartDate.HasValue && x.EndDate.HasValue, () =>
        {
            RuleFor(x => x.StartDate!.Value)
                .LessThanOrEqualTo(x => x.EndDate!.Value)
                .WithMessage("StartDate must be earlier than or equal to EndDate.");
        });
    }
}

public sealed class ExportAuditLogsQueryHandler : IRequestHandler<ExportAuditLogsQuery, AuditExportResultDto>
{
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IClinicContext _clinicContext;

    public ExportAuditLogsQueryHandler(
        IRepository<AuditEntry> auditRepo,
        IClinicContext clinicContext)
    {
        _auditRepo = auditRepo ?? throw new ArgumentNullException(nameof(auditRepo));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
    }

    public async Task<AuditExportResultDto> Handle(ExportAuditLogsQuery request, CancellationToken cancellationToken)
    {
        IQueryable<AuditEntry> query = _auditRepo.Query().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.Category) && !string.Equals(request.Category, "All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.Category == request.Category.Trim());
        }

        if (!string.IsNullOrWhiteSpace(request.Severity) && !string.Equals(request.Severity, "All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.Severity == request.Severity.Trim());
        }

        if (!string.IsNullOrWhiteSpace(request.Action))
        {
            query = query.Where(e => e.Action == request.Action.Trim());
        }

        if (request.ActorId.HasValue)
        {
            query = query.Where(e => e.ActorStaffId == request.ActorId.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.EntityId))
        {
            query = query.Where(e => e.TargetEntityId == request.EntityId.Trim());
        }

        if (request.StartDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(request.StartDate.Value, DateTimeKind.Utc);
            query = query.Where(e => e.Timestamp >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endUtc = DateTime.SpecifyKind(request.EndDate.Value, DateTimeKind.Utc);
            query = query.Where(e => e.Timestamp <= endUtc);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(e =>
                e.ActorName.ToLower().Contains(term) ||
                e.Action.ToLower().Contains(term) ||
                e.Description.ToLower().Contains(term) ||
                e.TargetEntityType.ToLower().Contains(term) ||
                (e.TargetEntityId != null && e.TargetEntityId.ToLower().Contains(term)) ||
                (e.PatientNameMasked != null && e.PatientNameMasked.ToLower().Contains(term)) ||
                (e.PatientPinMasked != null && e.PatientPinMasked.ToLower().Contains(term)));
        }

        var limit = Math.Clamp(request.Limit, 1, 10000);

        var entries = await query
            .OrderByDescending(e => e.Timestamp)
            .ThenByDescending(e => e.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

        var dtos = entries.Select(GetAuditLogsQueryHandler.MapToDto).ToList();

        var timestampStr = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
        var clinicIdStr = _clinicContext.ClinicId.ToString();
        var shortClinicId = clinicIdStr.Length >= 8 ? clinicIdStr[..8] : clinicIdStr;

        if (string.Equals(request.Format, "json", StringComparison.OrdinalIgnoreCase))
        {
            var jsonBytes = AuditExportFormatter.FormatJson(dtos);
            return new AuditExportResultDto(
                ContentBytes: jsonBytes,
                ContentType: "application/json; charset=utf-8",
                FileName: $"audit-log-{shortClinicId}-{timestampStr}.json",
                RowCount: dtos.Count);
        }

        var csvBytes = AuditExportFormatter.FormatCsv(dtos);
        return new AuditExportResultDto(
            ContentBytes: csvBytes,
            ContentType: "text/csv; charset=utf-8",
            FileName: $"audit-log-{shortClinicId}-{timestampStr}.csv",
            RowCount: dtos.Count);
    }
}
