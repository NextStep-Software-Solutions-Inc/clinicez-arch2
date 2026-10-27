using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Interop.Tests;

public class HubEnvelopeCeilingAdversarialTests
{
    private const string Chatter = "clinic.note";
    private const int EightMebibytes = 8_388_608;

    [Fact]
    public void HubOptions_DefaultMaxEnvelopeBytes_IsExactly8MiB()
    {
        var options = new HubOptions();
        options.MaxEnvelopeBytes.Should().Be(EightMebibytes, "default ceiling must be 8_388_608 bytes (8 MiB)");
    }

    [Fact]
    public void AppSettingsJson_BindsMaxEnvelopeBytesTo8MiB()
    {
        var appsettingsPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../ClinicEz.Interop.Api/appsettings.json"));

        File.Exists(appsettingsPath).Should().BeTrue($"appsettings.json must exist at {appsettingsPath}");

        var config = new ConfigurationBuilder()
            .AddJsonFile(appsettingsPath)
            .Build();

        var options = new HubOptions();
        config.GetSection(HubOptions.Section).Bind(options);

        options.MaxEnvelopeBytes.Should().Be(EightMebibytes, "interop-hub appsettings.json Hub:MaxEnvelopeBytes must be 8388608");
    }

    [Fact]
    public async Task HubEnvelope_Within8MiBCeiling_e_g_8000000Bytes_IsAccepted()
    {
        await using var hub = await HubApp.StartCloudAsync(overrides: new()
        {
            ["Hub:MaxEnvelopeBytes"] = EightMebibytes.ToString()
        });

        // Construct an envelope that serialized is ~8,000,000 bytes
        // Overhead of envelope headers is roughly 300 bytes, so 7,999,500 payload bytes
        var payloadBlob = new string('A', 7_999_500);
        var envelope = W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { blob = payloadBlob });

        var size = Encoding.UTF8.GetByteCount(envelope.ToJson());
        size.Should().BeGreaterThan(7_999_000);
        size.Should().BeLessThan(EightMebibytes);

        var result = await hub.SendAsync("clinic", envelope);
        result.Status.Should().Be(SendResult.Accepted, $"envelope of {size} bytes is below {EightMebibytes} and must be accepted");
        (await hub.MessageCountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task HubEnvelope_Exceeding8MiBCeiling_IsRejectedWithExplicitError()
    {
        await using var hub = await HubApp.StartCloudAsync(overrides: new()
        {
            ["Hub:MaxEnvelopeBytes"] = EightMebibytes.ToString()
        });

        // 8,500,000 bytes payload is definitely > 8_388_608
        var payloadBlob = new string('X', 8_500_000);
        var envelope = W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { blob = payloadBlob });

        var size = Encoding.UTF8.GetByteCount(envelope.ToJson());
        size.Should().BeGreaterThan(EightMebibytes);

        var result = await hub.SendAsync("clinic", envelope);
        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("limit is 8388608");
        result.Reason.Should().Contain($"Envelope is {size} bytes");
        (await hub.MessageCountAsync()).Should().Be(0, "rejected envelope must not be enqueued to outbound");
    }

    [Fact]
    public async Task HubEnvelope_ExactBoundaryTransition_8388608Accepted_8388609Rejected()
    {
        await using var hub = await HubApp.StartCloudAsync(overrides: new()
        {
            ["Hub:MaxEnvelopeBytes"] = EightMebibytes.ToString()
        });

        // Calculate exact string length to hit exactly 8_388_608 bytes total JSON
        // Reuse baseEnv's timestamp via record `with` so DateTimeOffset fractional-zero formatting never shifts byte length by 1.
        var baseEnv = W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { blob = "" });
        var emptySize = Encoding.UTF8.GetByteCount(baseEnv.ToJson());
        var targetPadding = EightMebibytes - emptySize;

        var exactEnv = baseEnv with
        {
            MessageId = Guid.NewGuid(),
            Payload = new { blob = new string('B', targetPadding) }.ToElement()
        };
        var exactSize = Encoding.UTF8.GetByteCount(exactEnv.ToJson());
        exactSize.Should().Be(EightMebibytes, "exact envelope must be precisely 8_388_608 bytes");

        // 1. Exactly at limit -> Accepted
        var acceptedResult = await hub.SendAsync("clinic", exactEnv);
        acceptedResult.Status.Should().Be(SendResult.Accepted);

        // 2. Exactly 1 byte above limit -> Rejected
        var overflowEnv = baseEnv with
        {
            MessageId = Guid.NewGuid(),
            Payload = new { blob = new string('B', targetPadding + 1) }.ToElement()
        };
        var overflowSize = Encoding.UTF8.GetByteCount(overflowEnv.ToJson());
        overflowSize.Should().Be(EightMebibytes + 1, "overflow envelope must be precisely 8_388_609 bytes");

        var rejectedResult = await hub.SendAsync("clinic", overflowEnv);
        rejectedResult.Status.Should().Be(SendResult.Rejected);
        rejectedResult.Reason.Should().Be("Envelope is 8388609 bytes; the limit is 8388608.");
    }

    [Fact]
    public void HubOptionsValidator_EnforcesMinimum1024Bytes()
    {
        var validator = new HubOptionsValidator();
        var invalid = new HubOptions { MaxEnvelopeBytes = 1023 };
        var invalidResult = validator.Validate(null, invalid);
        invalidResult.Failed.Should().BeTrue();
        invalidResult.Failures.Should().Contain("Hub:MaxEnvelopeBytes must be at least 1024.");

        var valid = new HubOptions { MaxEnvelopeBytes = EightMebibytes };
        var validResult = validator.Validate(null, valid);
        validResult.Succeeded.Should().BeTrue();
    }
}
