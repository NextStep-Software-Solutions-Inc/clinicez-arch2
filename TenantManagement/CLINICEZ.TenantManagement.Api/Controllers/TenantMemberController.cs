using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.CreateTenantMember;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.DeleteTenantMember;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.UpdateTenantMember;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Queries.GetTenantMemberByIdQuery;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Queries.GetTenantMembersQuery;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.TenantManagement.Api.Controllers
{
    [Route("tenant-members")]
    [ApiController]
    public class TenantMembersController(ISender mediator) : ControllerBase
    {
        [HttpPost]
        [ProducesResponseType(typeof(ApiResponse<TenantMember>), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateTenantMember([FromBody] CreateTenantMemberCommand command)
        {
            var tenantMember = await mediator.Send(command);

            if (!tenantMember.Succeeded)
                return BadRequest(tenantMember);

            return CreatedAtAction(nameof(GetTenantMemberById), new { id = tenantMember.Data }, tenantMember);
        }

        [HttpGet]
        [ProducesResponseType(typeof(PaginatedApiResponse<TenantMember>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantMembers([FromQuery] GetTenantMembersQuery query)
        {
            var result = await mediator.Send(query);
            return Ok(result);
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ApiResponse<TenantMember>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetTenantMemberById(Guid id)
        {
            var query = new GetTenantMemberByIdQuery(id);
            var tenantMember = await mediator.Send(query);

            return tenantMember.Succeeded ? Ok(tenantMember) : BadRequest(tenantMember);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateTenantMember(Guid id, [FromBody] UpdateTenantMemberDto tenantMemberDto)
        {
            var request = new UpdateTenantMemberCommand
            {
                Id = id,
                UpdateTenantMember = tenantMemberDto
            };

            var tenantMember = await mediator.Send(request);
            return tenantMember.Succeeded ? Ok(tenantMember) : BadRequest(tenantMember);
        }

        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteTenantMember(Guid id)
        {
            var command = new DeleteTenantMemberCommand(id);
            var tenantMember = await mediator.Send(command);

            return tenantMember.Succeeded ? Ok(tenantMember) : BadRequest(tenantMember);
        }
    }
}
