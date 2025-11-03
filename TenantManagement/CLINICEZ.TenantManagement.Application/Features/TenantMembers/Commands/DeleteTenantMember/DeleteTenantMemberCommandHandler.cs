using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.DeleteTenantMember;

public class DeleteTenantMemberCommandHandler(IUnitOfWork unitOfWork) : IRequestHandler<DeleteTenantMemberCommand, ApiResponse<Unit>>
{
    public async Task<ApiResponse<Unit>> Handle(DeleteTenantMemberCommand request, CancellationToken cancellationToken)
    {
        var tenantMember = await unitOfWork.TenantMemberRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant member not found.");

        unitOfWork.TenantMemberRepository.Remove(tenantMember);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Unit>.Success(Unit.Value, $"Tenant member deleted successfully.");
    }
}
