using System;
using System.Linq;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.TestInfrastructure;

/// <summary>
/// Conditionally skips integration tests requiring live Docker containers (via Testcontainers)
/// when the Docker daemon is not running on the host machine or in standard CI without Docker.
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class DockerAvailableFactAttribute : FactAttribute
{
    public DockerAvailableFactAttribute()
    {
        if (ShouldSkip())
        {
            Skip = "Integration test requiring live Docker/Testcontainers infrastructure is skipped when Docker daemon is unavailable.";
        }
    }

    private static bool ShouldSkip()
    {
        var runExplicit = Environment.GetEnvironmentVariable("RUN_INTEGRATION_TESTS");
        if (string.Equals(runExplicit, "true", StringComparison.OrdinalIgnoreCase))
        {
            return !IsDockerAvailable();
        }

        if (IsCiEnvironment())
        {
            return true;
        }

        return !IsDockerAvailable();
    }

    private static bool IsCiEnvironment()
    {
        var ci = Environment.GetEnvironmentVariable("CI")
              ?? Environment.GetEnvironmentVariable("GITHUB_ACTIONS");
        return string.Equals(ci, "true", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDockerAvailable()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var pipes = System.IO.Directory.GetFiles(@"\\.\pipe\");
                return pipes.Any(p => p.Contains("docker_engine", StringComparison.OrdinalIgnoreCase)
                                   || p.Contains("dockerDesktopLinuxEngine", StringComparison.OrdinalIgnoreCase));
            }

            return System.IO.File.Exists("/var/run/docker.sock");
        }
        catch
        {
            return false;
        }
    }
}
