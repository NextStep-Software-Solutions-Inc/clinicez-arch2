using ClinicEz.Patient.MigrationTool.Models;

namespace ClinicEz.Patient.MigrationTool.Services;

public sealed class MigrationState
{
    private readonly object _sync = new();
    private MigrationReport? _latestReport;

    public MigrationReport? LatestReport
    {
        get
        {
            lock (_sync)
                return _latestReport;
        }
    }

    public void SetLatest(MigrationReport report)
    {
        lock (_sync)
            _latestReport = report;
    }
}

