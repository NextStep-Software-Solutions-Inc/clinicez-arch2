using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Modules.Commands.CreateModule;
using CLINICEZ.TenantManagement.Application.Features.Modules.Commands.DeleteModule;
using CLINICEZ.TenantManagement.Application.Features.Modules.Commands.UpdateModule;
using CLINICEZ.TenantManagement.Application.Features.Modules.Dtos;
using CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModuleById;
using CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModules;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.TenantManagement.Api.Controllers
{
    [Route("modules")]
    [ApiController]
    public class ModulesController(ISender mediator) : ControllerBase
    {
        [HttpPost]
        [ProducesResponseType(typeof(ApiResponse<Module>), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ApiResponse<Module>), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateModule([FromBody] CreateModuleCommand command)
        {
            var module = await mediator.Send(command);

            if (!module.Succeeded)
                return BadRequest(module);

            return CreatedAtAction(nameof(GetModuleById), new { id = module.Data }, module);
        }

        [HttpGet]
        [ProducesResponseType(typeof(PaginatedApiResponse<Module>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetModules([FromQuery] GetModulesQuery query)
        {
            var result = await mediator.Send(query);
            return Ok(result);
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ApiResponse<Module>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetModuleById(Guid id)
        {
            var module = await mediator.Send(new GetModuleByIdQuery(id));

            return module.Succeeded ? Ok(module) : BadRequest(module);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateModule(Guid id, [FromBody] UpdateModuleDto updateModule)
        {
            var request = new UpdateModuleCommand
            {
                Id = id,
                UpdateModule = updateModule
            };

            var module = await mediator.Send(request);
            return module.Succeeded ? Ok(module) : BadRequest(module);
        }

        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteModule(Guid id)
        {
            var command = new DeleteModuleCommand(id);
            var module = await mediator.Send(command);

            return module.Succeeded ? Ok(module) : BadRequest(module);
        }
    }
}
