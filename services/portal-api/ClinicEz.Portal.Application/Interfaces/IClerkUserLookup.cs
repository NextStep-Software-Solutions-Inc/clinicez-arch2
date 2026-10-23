using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IClerkUserLookup
{
    Task<IReadOnlyList<string>> GetVerifiedEmailsAsync(string clerkUserId, CancellationToken cancellationToken = default);
}
