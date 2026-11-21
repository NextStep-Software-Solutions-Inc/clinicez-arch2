using System;

namespace ClinicEz.MediaBroker.Application.Common.Interfaces;

public interface ILiveKitTokenService
{
    string CreateRoomToken(string roomName, string participantIdentity, TimeSpan ttl);
}
