using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService _pdfService;
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public ReportsController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<ClinicSettings> settingsRepo)
    {
        _sender = sender;
        _pdfService = pdfService;
        _settingsRepo = settingsRepo;
    }

    [HttpGet("daily-eod")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<DailyEodReportDto>>> GetDailyEodReport(
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetDailyEodReportQuery(date), ct);
        return Ok(ApiResponse<DailyEodReportDto>.Success(result));
    }

    [HttpGet("analytics")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<ClinicAnalyticsDto>>> GetClinicAnalytics(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicAnalyticsQuery(startDate, endDate), ct);
        return Ok(ApiResponse<ClinicAnalyticsDto>.Success(result));
    }

    [HttpGet("morbidity")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<MorbidityReportDto>>> GetMorbidityReport(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetMorbidityReportQuery(startDate, endDate), ct);
        return Ok(ApiResponse<MorbidityReportDto>.Success(result));
    }

    [HttpGet("tax-discounts")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<TaxDiscountAuditReportDto>>> GetTaxDiscountAuditReport(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetTaxDiscountAuditReportQuery(startDate, endDate), ct);
        return Ok(ApiResponse<TaxDiscountAuditReportDto>.Success(result));
    }

    [HttpGet("doctor-shares")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<DoctorSharesReportDto>>> GetDoctorSharesReport(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetDoctorSharesReportQuery(startDate, endDate), ct);
        return Ok(ApiResponse<DoctorSharesReportDto>.Success(result));
    }

    [HttpGet("daily-eod/pdf")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<IActionResult> GetDailyEodReportPdf(
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        var report = await _sender.Send(new GetDailyEodReportQuery(date), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = report.TenantId,
            ClinicId = report.ClinicId,
            ClinicName = "Clinic"
        };
        var pdfBytes = _pdfService.GenerateDailyEodReportPdf(report, settings, User?.Identity?.Name);
        return File(pdfBytes, "application/pdf", $"DailyEodReport-{report.ReportDate:yyyyMMdd}.pdf");
    }

    [HttpGet("morbidity/pdf")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<IActionResult> GetMorbidityReportPdf(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var report = await _sender.Send(new GetMorbidityReportQuery(startDate, endDate), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = report.TenantId,
            ClinicId = report.ClinicId,
            ClinicName = report.ClinicName ?? "Clinic"
        };
        var pdfBytes = _pdfService.GenerateMorbidityReportPdf(report, settings, User?.Identity?.Name);
        return File(pdfBytes, "application/pdf", $"MorbidityReport-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}.pdf");
    }

    [HttpGet("tax-discounts/pdf")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<IActionResult> GetTaxDiscountAuditReportPdf(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var report = await _sender.Send(new GetTaxDiscountAuditReportQuery(startDate, endDate), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = report.TenantId,
            ClinicId = report.ClinicId,
            ClinicName = "Clinic"
        };
        var pdfBytes = _pdfService.GenerateTaxDiscountAuditReportPdf(report, settings, User?.Identity?.Name);
        return File(pdfBytes, "application/pdf", $"TaxDiscountAuditReport-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}.pdf");
    }

    [HttpGet("doctor-shares/pdf")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<IActionResult> GetDoctorSharesReportPdf(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var report = await _sender.Send(new GetDoctorSharesReportQuery(startDate, endDate), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = report.TenantId,
            ClinicId = report.ClinicId,
            ClinicName = "Clinic"
        };
        var pdfBytes = _pdfService.GenerateDoctorSharesReportPdf(report, settings, User?.Identity?.Name);
        return File(pdfBytes, "application/pdf", $"DoctorSharesReport-{report.StartDate:yyyyMMdd}-{report.EndDate:yyyyMMdd}.pdf");
    }

    [HttpGet("analytics/pdf")]
    [HasPermission(ClinicPermissions.ReportsRead)]
    public async Task<IActionResult> GetClinicAnalyticsPdf(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var analytics = await _sender.Send(new GetClinicAnalyticsQuery(startDate, endDate), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = analytics.TenantId,
            ClinicId = analytics.ClinicId,
            ClinicName = "Clinic"
        };
        var pdfBytes = _pdfService.GenerateClinicAnalyticsPdf(analytics, settings, User?.Identity?.Name);
        return File(pdfBytes, "application/pdf", $"ClinicAnalyticsReport-{analytics.StartDate:yyyyMMdd}-{analytics.EndDate:yyyyMMdd}.pdf");
    }
}
