using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Api.Hubs;

/// <summary>
/// SignalR hub for real-time sync state notifications and per-device session revocation.
///
/// Client-side events emitted by the server:
///   - <c>SyncCompleted</c>  — payload: { Applied: int, Conflicts: int }
///   - <c>SessionRevoked</c> — payload: { Reason: string }
///
/// Groups: <see cref="PatientGroup"/> — every connected device of a patient;
/// <see cref="DeviceGroup"/> — a single device, joined when the client passes its
/// <c>deviceId</c> query-string value on connect.
/// </summary>
[Authorize]
public sealed class SyncHub : Hub
{
    private readonly IPatientRepository _patientRepository;

    public SyncHub(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public static string PatientGroup(Guid patientId) => $"sync:patient:{patientId}";

    public static string DeviceGroup(Guid patientId, string deviceId) => $"sync:device:{patientId}:{deviceId}";

    public override async Task OnConnectedAsync()
    {
        var clerkUserId = Context.User?.FindFirstValue("sub")
                       ?? Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!string.IsNullOrWhiteSpace(clerkUserId))
        {
            var patient = await _patientRepository.GetByClerkUserIdAsync(clerkUserId);
            if (patient is not null)
            {
                Context.Items["PatientId"] = patient.Id;
                await Groups.AddToGroupAsync(Context.ConnectionId, PatientGroup(patient.Id));

                var deviceId = Context.GetHttpContext()?.Request.Query["deviceId"].ToString();
                if (!string.IsNullOrWhiteSpace(deviceId))
                {
                    Context.Items["DeviceId"] = deviceId;
                    await Groups.AddToGroupAsync(Context.ConnectionId, DeviceGroup(patient.Id, deviceId));
                }
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue("PatientId", out var rawId) && rawId is Guid patientId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, PatientGroup(patientId));

            if (Context.Items.TryGetValue("DeviceId", out var rawDevice) && rawDevice is string deviceId)
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, DeviceGroup(patientId, deviceId));
        }

        await base.OnDisconnectedAsync(exception);
    }
}
