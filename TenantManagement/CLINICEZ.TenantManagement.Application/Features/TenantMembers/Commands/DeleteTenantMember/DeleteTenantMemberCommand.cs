using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.DeleteTenantMember;

public record class DeleteTenantMemberCommand(Guid Id) : IRequest<ApiResponse<Unit>>;
