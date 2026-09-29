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
}
