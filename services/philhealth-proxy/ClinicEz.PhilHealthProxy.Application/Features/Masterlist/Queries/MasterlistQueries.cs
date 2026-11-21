using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Masterlist.Queries;

public sealed record DownloadIndividualMasterlistQuery(MasterlistIndividualRequest Request) : IRequest<MasterlistDownloadResponse>;

public sealed class DownloadIndividualMasterlistQueryValidator : AbstractValidator<DownloadIndividualMasterlistQuery>
{
    public DownloadIndividualMasterlistQueryValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.EffYear).NotEmpty().WithMessage("Effective year is required.");
    }
}

public sealed class DownloadIndividualMasterlistQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<DownloadIndividualMasterlistQuery, MasterlistDownloadResponse>
{
    public async Task<MasterlistDownloadResponse> Handle(DownloadIndividualMasterlistQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.DownloadIndividualMasterlistAsync(query.Request, tenant, ct);
    }
}

public sealed record DownloadBatchMasterlistQuery(MasterlistBatchRequest Request) : IRequest<MasterlistDownloadResponse>;

public sealed class DownloadBatchMasterlistQueryValidator : AbstractValidator<DownloadBatchMasterlistQuery>
{
    public DownloadBatchMasterlistQueryValidator()
    {
        RuleFor(x => x.Request.StartDate).NotEmpty().WithMessage("Start date is required.");
        RuleFor(x => x.Request.EndDate).NotEmpty().WithMessage("End date is required.");
    }
}

public sealed class DownloadBatchMasterlistQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<DownloadBatchMasterlistQuery, MasterlistDownloadResponse>
{
    public async Task<MasterlistDownloadResponse> Handle(DownloadBatchMasterlistQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.DownloadBatchMasterlistAsync(query.Request, tenant, ct);
    }
}
