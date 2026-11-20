using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

public sealed class YakapScreeningDispatcher : IYakapScreeningDispatcher
{
    private readonly ISender _sender;

    public YakapScreeningDispatcher(ISender sender)
    {
        _sender = sender;
    }

    public Task DispatchFpeSubmissionAsync(Guid healthScreeningId, CancellationToken ct = default) =>
        _sender.Send(new SubmitHealthScreeningYakapFpeCommand(healthScreeningId), ct);
}
