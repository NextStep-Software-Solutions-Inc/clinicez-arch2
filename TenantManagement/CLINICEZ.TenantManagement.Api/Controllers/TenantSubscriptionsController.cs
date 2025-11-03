using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.CreateTenantSubscription;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.DeleteTenantSubscription;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.UpdateTenantSubscription;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Queries.GetTenantSubscriptionById;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Queries.GetTenantSubscriptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.TenantManagement.Api.Controllers
{
    [Route("tenant-subscriptions")]
    [ApiController]
    public class TenantSubscriptionsController(ISender mediator) : ControllerBase
    {
        [HttpPost]
        [ProducesResponseType(typeof(ApiResponse<TenantSubscription>), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateTenantSubscription([FromBody] CreateTenantSubscriptionCommand command)
        {
            var tenantSubscription = await mediator.Send(command);

            return tenantSubscription.Succeeded ? CreatedAtAction(nameof(GetTenantSubscriptionById), new { id = tenantSubscription.Data }, tenantSubscription) : BadRequest(tenantSubscription);
        }

        [HttpGet]
        [ProducesResponseType(typeof(PaginatedApiResponse<TenantSubscription>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTenantSubscriptions([FromQuery] GetTenantSubscriptionsQuery query)
        {
            var result = await mediator.Send(query);
            return result.Succeeded ? Ok(result) : BadRequest(result);
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ApiResponse<TenantSubscription>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetTenantSubscriptionById(Guid id)
        {
            var query = new GetTenantSubscriptionByIdQuery(id);
            var tenantSubscription = await mediator.Send(query);

            return tenantSubscription.Succeeded ? Ok(tenantSubscription) : BadRequest(tenantSubscription);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateTenantSubscription(Guid id, [FromBody] UpdateTenantSubscriptionDto tenantSubscriptionDto)
        {
            var request = new UpdateTenantSubscriptionCommand
            {
                Id = id,
                UpdateTenantSubscription = tenantSubscriptionDto
            };

            var tenantSubscription = await mediator.Send(request);
            return tenantSubscription.Succeeded ? Ok(tenantSubscription) : BadRequest(tenantSubscription);
        }

        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteTenantSubscription(Guid id)
        {
            var command = new DeleteTenantSubscriptionCommand(id);
            var tenantSubscription = await mediator.Send(command);

            return tenantSubscription.Succeeded ? Ok(tenantSubscription) : BadRequest(tenantSubscription);
        }
    }
}
