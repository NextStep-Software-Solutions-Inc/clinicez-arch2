using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents;

public static class QuestPdfInitializer
{
    private static bool _initialized = false;
    private static readonly object _lock = new();

    public static void EnsureInitialized()
    {
        if (_initialized) return;
        lock (_lock)
        {
            if (!_initialized)
            {
                QuestPDF.Settings.License = LicenseType.Community;
                _initialized = true;
            }
        }
    }
}
