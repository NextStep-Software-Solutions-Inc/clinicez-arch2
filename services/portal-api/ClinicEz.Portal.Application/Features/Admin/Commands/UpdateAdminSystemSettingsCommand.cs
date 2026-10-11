using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record UpdateAdminSystemSettingsCommand(
    IDictionary<string, string> Settings,
    string UpdatedBy
) : IRequest<IReadOnlyList<SystemSettingDto>>;

public sealed class UpdateAdminSystemSettingsCommandHandler(ISystemSettingsService settingsService)
    : IRequestHandler<UpdateAdminSystemSettingsCommand, IReadOnlyList<SystemSettingDto>>
{
    public async Task<IReadOnlyList<SystemSettingDto>> Handle(UpdateAdminSystemSettingsCommand request, CancellationToken cancellationToken)
    {
        await settingsService.UpdateSettingsAsync(request.Settings, request.UpdatedBy, cancellationToken);
        return await settingsService.GetAllSettingsAsync(cancellationToken);
    }
}
