using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModuleById;

public record GetModuleByIdQuery(Guid Id) : IRequest<ApiResponse<Module>>;