using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Queries;

public sealed record GetUploadStatusQuery(string UploadTransactionNo) : IRequest<DataUploadStatusResponse>;

public sealed class GetUploadStatusQueryValidator : AbstractValidator<GetUploadStatusQuery>
{
    public GetUploadStatusQueryValidator()
    {
        RuleFor(x => x.UploadTransactionNo).NotEmpty().WithMessage("Upload transaction number is required.");
    }
}

public sealed class GetUploadStatusQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<GetUploadStatusQuery, DataUploadStatusResponse>
{
    public async Task<DataUploadStatusResponse> Handle(GetUploadStatusQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.GetUploadStatusAsync(query.UploadTransactionNo, tenant, ct);
    }
}
