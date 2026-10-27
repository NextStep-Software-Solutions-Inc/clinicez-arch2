using System;

namespace ClinicEz.Comms.Domain.Entities;

public static class AllowedReactions
{
    public const string ThumbsUp = "thumbs_up";
    public const string ThumbsDown = "thumbs_down";
    public const string Heart = "heart";
    public const string Laugh = "laugh";
    public const string Surprised = "surprised";
    public const string Sad = "sad";

    public static readonly HashSet<string> All = new(StringComparer.Ordinal)
    {
        ThumbsUp,
        ThumbsDown,
        Heart,
        Laugh,
        Surprised,
        Sad
    };

    public static bool IsValid(string reaction) => All.Contains(reaction);
}

public class MessageReaction
{
    public Guid MessageId { get; set; }
    public Message? Message { get; set; }

    public string UserId { get; set; } = string.Empty;
    public string? UserDisplayName { get; set; }

    public string Reaction { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
