using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/services")]
public sealed class ServicesController : ControllerBase
{
    private readonly ISender _sender;

    public ServicesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.ServicesRead)]
    public async Task<ActionResult<ApiResponse<List<ClinicServiceItemDto>>>> GetServices(
        [FromQuery] string? category,
        [FromQuery] bool? isActive,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicServicesQuery(category, isActive), ct);
        return Ok(ApiResponse<List<ClinicServiceItemDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.ServicesManage)]
    public async Task<ActionResult<ApiResponse<ClinicServiceItemDto>>> CreateService(
        [FromBody] CreateClinicServiceItemCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicServiceItemDto>.Success(result, "Service created successfully."));
    }
}
