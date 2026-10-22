using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IClerkPasswordService
{
    Task SetUserPasswordAsync(
        string? clerkUserId,
        string email,
        string newPassword,
        CancellationToken cancellationToken = default);
}
