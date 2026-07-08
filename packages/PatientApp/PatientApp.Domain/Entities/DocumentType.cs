using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class DocumentType : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SupportedExtensionsJson { get; set; } = "[]";
    public string SupportedMimeTypesJson { get; set; } = "[]";
    public string NativePreviewKind { get; set; } = "external";
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
