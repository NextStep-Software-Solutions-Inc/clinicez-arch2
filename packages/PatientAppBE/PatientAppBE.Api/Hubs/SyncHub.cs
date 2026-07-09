using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Api.Hubs;

/// <summary>
/// SignalR hub for real-time sync state notifications and single-device session enforcement.
///
/// Client-side events emitted by the server:
///   - <c>SyncCompleted</c>  — payload: { Applied: int, Conflicts: int }
///   - <c>SessionRevoked</c> — payload: { Reason: string }
///
/// Group key: <see cref="PatientGroup"/> — one group per patient; keyed by PatientId.
/// </summary>
[Authorize]
public sealed class SyncHub : Hub
{
    private readonly IPatientRepository _patientRepository;

    public SyncHub(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public static string PatientGroup(Guid patientId) => $"sync:patient:{patientId}";

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
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue("PatientId", out var rawId) && rawId is Guid patientId)
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, PatientGroup(patientId));

        await base.OnDisconnectedAsync(exception);
    }
}

