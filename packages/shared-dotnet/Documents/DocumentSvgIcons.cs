namespace ClinicEz.Shared.Documents;

/// <summary>
/// Vector SVG icons for QuestPDF documents ensuring 100% cross-platform,
/// resolution-independent rendering without font-glyph missing errors ([?]).
/// </summary>
public static class DocumentSvgIcons
{
    /// <summary>
    /// Crisp vector Rx (medical prescription) symbol.
    /// </summary>
    public static string RxSymbol(string colorHex = "#0D6963") =>
        $@"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100%' height='100%'>
            <path d='M20 12 h28 c18 0 28 9 28 22 c0 12 -9 20 -20 22 l22 32 h-16 l-18 -27 h-8 v27 h-16 z M36 25 v21 h12 c7 0 12 -3 12 -10 c0 -7 -5 -11 -12 -11 z' fill='{colorHex}'/>
            <path d='M44 68 l24 24 M68 68 l-24 24' stroke='{colorHex}' stroke-width='6.5' stroke-linecap='round'/>
        </svg>";

    /// <summary>
    /// Statutory warning triangle icon.
    /// </summary>
    public static string WarningTriangle(string colorHex = "#DC2626") =>
        $@"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='100%' height='100%' fill='none' stroke='{colorHex}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
            <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/>
            <line x1='12' y1='9' x2='12' y2='13'/>
            <line x1='12' y1='17' x2='12.01' y2='17'/>
        </svg>";

    /// <summary>
    /// Digital certification checkmark badge.
    /// </summary>
    public static string CheckmarkCircle(string colorHex = "#16A34A") =>
        $@"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='100%' height='100%' fill='none' stroke='{colorHex}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>
            <circle cx='12' cy='12' r='10'/>
            <path d='M8 12.5l2.5 2.5 5.5-5.5'/>
        </svg>";

    /// <summary>
    /// Clinic / hospital building emblem.
    /// </summary>
    public static string ClinicBuilding(string colorHex = "#0D6963") =>
        $@"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='100%' height='100%' fill='none' stroke='{colorHex}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>
            <rect x='4' y='2' width='16' height='20' rx='2' ry='2'/>
            <path d='M9 22v-4h6v4'/>
            <path d='M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01'/>
        </svg>";
}
