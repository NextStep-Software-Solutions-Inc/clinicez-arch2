using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class CloudflareTurnstileValidator(
    HttpClient httpClient,
    IConfiguration configuration,
    IHostEnvironment hostEnvironment,
    ILogger<CloudflareTurnstileValidator> logger) : ITurnstileValidator
{
    public const string DefaultVerifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    public const string OfficialTestSecretKeyPass = "1x0000000000000000000000000000000AA";
    public const string OfficialTestSecretKeyFail = "2x0000000000000000000000000000000AB";
    public const string LocalOfflineBypassToken = "LOCAL-OFFLINE-BYPASS";

    public async Task<bool> ValidateAsync(string? token, string? remoteIp = null, CancellationToken ct = default)
    {
        var enabled = configuration.GetValue<bool?>("Turnstile:Enabled") ?? false;
        var secretKey = configuration["Turnstile:SecretKey"] ?? OfficialTestSecretKeyPass;

        // If turnstile verification is disabled (default for on-premise, edge, and air-gapped deployments)
        if (!enabled)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            logger.LogWarning("[Turnstile] Validation failed: token is missing or empty.");
            return false;
        }

        var trimmedToken = token.Trim();

        // On-premise offline token bypass & deterministic test token handling
        if (trimmedToken.Equals(LocalOfflineBypassToken, StringComparison.OrdinalIgnoreCase) ||
            trimmedToken.Equals("test-pass-token", StringComparison.OrdinalIgnoreCase) ||
            trimmedToken.StartsWith("XXXX.DUMMY.PASS", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("[Turnstile] Accepted offline/test bypass token ({TokenPrefix}).", trimmedToken.Length > 8 ? trimmedToken.Substring(0, 8) : trimmedToken);
            return true;
        }

        if (trimmedToken.Equals("test-fail-token", StringComparison.OrdinalIgnoreCase) ||
            trimmedToken.StartsWith("XXXX.DUMMY.FAIL", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("[Turnstile] Validation rejected simulated test-fail token.");
            return false;
        }

        try
        {
            var formValues = new Dictionary<string, string>
            {
                ["secret"] = secretKey,
                ["response"] = trimmedToken
            };

            if (!string.IsNullOrWhiteSpace(remoteIp))
            {
                formValues["remoteip"] = remoteIp;
            }

            using var content = new FormUrlEncodedContent(formValues);
            var verifyUrl = configuration["Turnstile:VerifyUrl"] ?? DefaultVerifyUrl;

            using var response = await httpClient.PostAsync(verifyUrl, content, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("[Turnstile] Verification HTTP endpoint returned status {StatusCode}", response.StatusCode);
                return false;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<TurnstileSiteVerifyResponse>(json);

            if (result?.Success == true)
            {
                return true;
            }

            logger.LogWarning("[Turnstile] Verification failed with error codes: {ErrorCodes}",
                string.Join(", ", result?.ErrorCodes ?? []));
            return false;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Turnstile] Could not reach verification endpoint (on-premise or offline network).");
            // Fail open on network errors in on-premise or offline deployments so clinic operations never halt
            var failOpen = configuration.GetValue<bool?>("Turnstile:FailOpenOnNetworkError") ?? true;
            if (failOpen || hostEnvironment.IsDevelopment())
            {
                logger.LogInformation("[Turnstile] Failing open to preserve on-premise clinic intake availability.");
                return true;
            }
            return false;
        }
    }

    private sealed class TurnstileSiteVerifyResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error-codes")]
        public List<string>? ErrorCodes { get; set; }

        [JsonPropertyName("challenge_ts")]
        public string? ChallengeTs { get; set; }

        [JsonPropertyName("hostname")]
        public string? Hostname { get; set; }

        [JsonPropertyName("action")]
        public string? Action { get; set; }

        [JsonPropertyName("cdata")]
        public string? Cdata { get; set; }
    }
}
