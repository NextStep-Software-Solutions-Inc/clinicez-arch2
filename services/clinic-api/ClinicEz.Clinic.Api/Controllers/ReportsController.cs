using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly ISender _sender;

    public ReportsController(ISender sender)
    {
        _sender = sender;
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
}
