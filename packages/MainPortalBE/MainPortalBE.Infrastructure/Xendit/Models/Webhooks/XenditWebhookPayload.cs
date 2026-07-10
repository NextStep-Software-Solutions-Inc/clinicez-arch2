using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MainPortalBE.Infrastructure.Xendit.Models.Webhooks;

public class XenditWebhookPayload
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("event")] public string Event { get; set; } = string.Empty;
    [JsonPropertyName("created")] public string Created { get; set; } = string.Empty;
    [JsonPropertyName("business_id")] public string BusinessId { get; set; } = string.Empty;
    [JsonPropertyName("data")] public Dictionary<string, JsonElement>? Data { get; set; }
    
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
