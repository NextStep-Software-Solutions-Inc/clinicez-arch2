using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.CreateTenantSetting;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.DeleteTenantSetting;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.UpdateTenantSetting;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Queries.GetTenantSettingById;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Queries.GetTenantSettings;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.TenantManagement.Api.Controllers
{
    [Route("tenant-settings")]
    [ApiController]
    public class TenantSettingsController(ISender mediator) : ControllerBase
    {
        [HttpPost]
        [ProducesResponseType(typeof(ApiResponse<TenantSetting>), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateTenantSetting([FromBody] CreateTenantSettingCommand command)
        {
            var tenantSetting = await mediator.Send(command);

            return tenantSetting.Succeeded ? CreatedAtAction(nameof(GetTenantSettingById), new { id = tenantSetting.Data }, tenantSetting) : BadRequest(tenantSetting);
        }

        [HttpGet]
        [ProducesResponseType(typeof(PaginatedApiResponse<TenantSetting>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantSettings([FromQuery] GetTenantSettingsQuery query)
        {
            var result = await mediator.Send(query);
            
            return result.Succeeded ? Ok(result) : BadRequest(result);
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ApiResponse<TenantSetting>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetTenantSettingById(Guid id)
        {
            var query = new GetTenantSettingByIdQuery(id);
            var tenantSetting = await mediator.Send(query);
                        
            return tenantSetting.Succeeded ? Ok(tenantSetting) : BadRequest(tenantSetting);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateTenantSetting(Guid id, [FromBody] UpdateTenantSettingDto tenantSettingDto)
        {
            var request = new UpdateTenantSettingCommand
            {
                Id = id,
                UpdateTenantSetting = tenantSettingDto
            };

            var tenantSetting = await mediator.Send(request);
            return tenantSetting.Succeeded ? Ok(tenantSetting) : BadRequest(tenantSetting);
        }

        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteTenantSetting(Guid id)
        {
            var command = new DeleteTenantSettingCommand(id);
            var tenantSetting = await mediator.Send(command);

            return tenantSetting.Succeeded ? Ok(tenantSetting) : BadRequest(tenantSetting);
        }
    }
}
