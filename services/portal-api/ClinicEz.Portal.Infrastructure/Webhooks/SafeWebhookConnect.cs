using ClinicEz.Portal.Application.Features.Workspace;
using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Infrastructure.Webhooks;

/// <summary>
/// Connect callback for the webhook <see cref="HttpClient"/>. It resolves the host itself and refuses loopback,
/// private, link-local and other reserved addresses, then connects to the exact address it checked. Checking at
/// connect time (instead of only when the URL is saved) is what defeats DNS-rebinding: a host that was public at
/// registration cannot later point the server at an internal service or the cloud metadata endpoint.
/// </summary>
public static class SafeWebhookConnect
{
    public static async ValueTask<System.IO.Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var host = context.DnsEndPoint.Host;

        IPAddress[] addresses;
        if (IPAddress.TryParse(host.Trim('[', ']'), out var literal))
        {
            addresses = [literal];
        }
        else
        {
            addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
        }

        var allowed = addresses.Where(a => !PublicHttpsUrl.IsPrivateOrReserved(a)).ToArray();
        if (allowed.Length == 0)
        {
            throw new HttpRequestException("The webhook host does not resolve to a public address.");
        }

        Exception? last = null;
        foreach (var address in allowed)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
                return new System.Net.Sockets.NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception ex)
            {
                socket.Dispose();
                last = ex;
            }
        }

        throw new HttpRequestException("Could not connect to the webhook host.", last);
    }
}
