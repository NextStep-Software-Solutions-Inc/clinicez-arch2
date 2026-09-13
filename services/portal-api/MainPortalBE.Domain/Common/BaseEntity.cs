namespace MainPortalBE.Domain.Common;

using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

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
    [JsonIgnore]
    public bool AllowHardDelete { get; set; }
}
