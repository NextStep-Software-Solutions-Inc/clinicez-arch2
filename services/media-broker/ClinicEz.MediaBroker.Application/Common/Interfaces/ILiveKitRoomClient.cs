using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.MediaBroker.Application.Common.Interfaces;

public interface ILiveKitRoomClient
{
    Task<bool> DeleteRoomAsync(string roomName, CancellationToken ct = default);
}
