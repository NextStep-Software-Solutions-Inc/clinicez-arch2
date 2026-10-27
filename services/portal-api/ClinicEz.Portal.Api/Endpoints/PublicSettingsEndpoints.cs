using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record PublicSettingsResponse(
    string AppleAppStoreUrl,
    string GooglePlayStoreUrl
);

public sealed class PublicSettingsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/public/settings", async (
            ISystemSettingsService settingsService,
            CancellationToken ct) =>
        {
            var apple = await settingsService.GetSettingValueAsync(
                "PatientApp:AppleAppStoreUrl",
                "https://apps.apple.com/app/clinicez-patient/id000000000",
                ct);
            var google = await settingsService.GetSettingValueAsync(
                "PatientApp:GooglePlayStoreUrl",
                "https://play.google.com/store/apps/details?id=com.clinicez.patient",
                ct);

            return Results.Ok(new PublicSettingsResponse(apple, google));
        })
        .AllowAnonymous()
        .WithName("GetPublicSettings")
        .WithDescription("Retrieves public mobile app store download links for the Clinic EZ Patient App.")
        .WithTags("Public");
    }
}
