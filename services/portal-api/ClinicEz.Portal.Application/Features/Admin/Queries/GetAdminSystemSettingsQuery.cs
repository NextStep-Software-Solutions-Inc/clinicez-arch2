using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetAdminSystemSettingsQuery() : IRequest<IReadOnlyList<SystemSettingDto>>;

public sealed class GetAdminSystemSettingsQueryHandler(ISystemSettingsService settingsService)
    : IRequestHandler<GetAdminSystemSettingsQuery, IReadOnlyList<SystemSettingDto>>
{
    public Task<IReadOnlyList<SystemSettingDto>> Handle(GetAdminSystemSettingsQuery request, CancellationToken cancellationToken)
    {
        return settingsService.GetAllSettingsAsync(cancellationToken);
    }
}
