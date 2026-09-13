using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Portal.Infrastructure.Xendit;

public static class XenditServiceCollectionExtensions
{
    public static IServiceCollection AddXenditClient(this IServiceCollection services)
    {
        services.AddHttpClient<IXenditApiClient, XenditApiClient>((sp, client) =>
        {
            var config = sp.GetRequiredService<IConfiguration>();

            var baseUrl = config["Xendit:BaseUrl"] ?? "https://api.xendit.co";
            client.BaseAddress = new Uri(baseUrl);

            var apiKey = config["Xendit:SecretKey"];
            if (!string.IsNullOrEmpty(apiKey))
            {
                var authBytes = Encoding.ASCII.GetBytes($"{apiKey}:");
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));
            }
        })
        .AddStandardResilienceHandler();

        return services;
    }
}
