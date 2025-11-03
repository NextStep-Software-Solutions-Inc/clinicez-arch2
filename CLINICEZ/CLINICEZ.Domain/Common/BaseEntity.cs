using System.ComponentModel.DataAnnotations.Schema;

namespace CLINICEZ.Domain.Common;

public abstract class BaseEntity : IEntity
{
    protected BaseEntity() { }
    public Guid Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public string? DeletedBy { get; set; }
    [NotMapped]
    public bool AllowHardDelete { get; set; }
}