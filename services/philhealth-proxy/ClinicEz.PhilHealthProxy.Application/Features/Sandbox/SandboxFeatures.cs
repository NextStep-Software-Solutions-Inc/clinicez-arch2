using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Sandbox;

public sealed record GetSandboxStatusQuery : IRequest<SandboxStatus>;

public sealed class GetSandboxStatusQueryHandler(IPcapiSandboxService sandboxService)
    : IRequestHandler<GetSandboxStatusQuery, SandboxStatus>
{
    public Task<SandboxStatus> Handle(GetSandboxStatusQuery request, CancellationToken ct)
    {
        return Task.FromResult(sandboxService.GetStatus());
    }
}

public sealed record SetSandboxScenarioCommand(string Scenario) : IRequest<SandboxStatus>;

public sealed class SetSandboxScenarioCommandHandler(IPcapiSandboxService sandboxService)
    : IRequestHandler<SetSandboxScenarioCommand, SandboxStatus>
{
    public Task<SandboxStatus> Handle(SetSandboxScenarioCommand request, CancellationToken ct)
    {
        if (Enum.TryParse<PcapiFaultScenario>(request.Scenario, true, out var scenario))
        {
            sandboxService.SetScenario(scenario);
        }
        else
        {
            throw new ArgumentException($"Invalid fault scenario '{request.Scenario}'.");
        }

        return Task.FromResult(sandboxService.GetStatus());
    }
}

public sealed record ResetSandboxCommand : IRequest<SandboxStatus>;

public sealed class ResetSandboxCommandHandler(IPcapiSandboxService sandboxService)
    : IRequestHandler<ResetSandboxCommand, SandboxStatus>
{
    public Task<SandboxStatus> Handle(ResetSandboxCommand request, CancellationToken ct)
    {
        sandboxService.Reset();
        return Task.FromResult(sandboxService.GetStatus());
    }
}
