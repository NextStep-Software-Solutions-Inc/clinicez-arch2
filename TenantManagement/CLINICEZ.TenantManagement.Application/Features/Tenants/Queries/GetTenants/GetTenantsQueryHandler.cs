using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Tenants.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;
using Sieve.Models;
using System.Linq.Expressions;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Queries.GetTenants;

public sealed class GetTenantsQueryHandler (IUnitOfWork unitOfWork) : IRequestHandler<GetTenantsQuery, PaginatedApiResponse<TenantDto>>
{
    public async Task<PaginatedApiResponse<TenantDto>> Handle(GetTenantsQuery query, CancellationToken cancellationToken)
    {
        var sieveModel = new SieveModel
        {
            PageSize = query.PageSize,
            Page = query.PageNumber,
            Filters = query.Filters,
            Sorts = query.Sorts
        };

        Expression<Func<Tenant, TenantDto>> projection = t => new ()
        {
            Id = t.Id,
            Name = t.Name,
            Description = t.Description,
            TenantSetting = new()
            {
                Id = t.TenantSetting.Id,
                OnPremise = t.TenantSetting.OnPremise,
                BaseURL = t.TenantSetting.BaseURL,
                DbConnectionString = t.TenantSetting.DbConnectionString,
                BillingContactEmail = t.TenantSetting.BillingContactEmail
            },
            TenantSubscriptions = t.TenantSubscriptions
                .Where(ts => ts.TenantId == t.Id)
                .Select(ts => new TenantSubscriptionDto
                {
                    Id = ts.Id,
                    Amount = ts.Amount,
                    Plan = ts.Plan.ToString(),
                    Status = ts.Status.ToString(),
                    BillingCycle = ts.BillingCycle.ToString(),
                    StartDate = ts.StartDate,
                    EndDate = ts.EndDate,
                    AutoRenew = ts.AutoRenew
                })
                .ToList()
        };

        var (tenantDtos, totalCount) = await unitOfWork.TenantRepository.GetAllAsync(sieveModel, projection, cancellationToken);

        return new PaginatedApiResponse<TenantDto>(
            [.. tenantDtos],
            query.PageNumber,
            query.PageSize,
            totalCount);
    }
}
