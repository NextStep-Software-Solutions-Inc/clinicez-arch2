using MainPortalBE.Domain.Common;
using System;

namespace MainPortalBE.Domain.Entities;

public class BlogArticle : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft"; // Draft, Published
    public DateTime? PublishedAt { get; set; }
    public string? BannerUrl { get; set; }
    public int Views { get; set; } = 0;
}
