using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Icd10;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/icd10")]
public sealed class Icd10Controller : ControllerBase
{
    private readonly ISender _sender;

    public Icd10Controller(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<Icd10ItemDto>>>> SearchCodes(
        [FromQuery] string? q,
        CancellationToken ct)
    {
        var result = await _sender.Send(new SearchIcd10CodesQuery(q), ct);
        return Ok(ApiResponse<IReadOnlyList<Icd10ItemDto>>.Success(result));
    }
}
