using Xunit;

namespace ClinicEz.Patient.Api.Tests.Infrastructure;

/// <summary>
/// Conditionally skips integration tests requiring real Docker containers (via Testcontainers)
/// when the Docker daemon is not running on the host machine.
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class DockerAvailableFactAttribute : FactAttribute
{
    public DockerAvailableFactAttribute()
    {
        if (!IsDockerAvailable())
        {
            Skip = "Docker daemon is not running on this host (Testcontainers requires Docker).";
        }
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
