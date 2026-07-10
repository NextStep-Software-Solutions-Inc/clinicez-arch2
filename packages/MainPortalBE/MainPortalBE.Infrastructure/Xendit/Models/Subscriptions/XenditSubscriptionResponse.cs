using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MainPortalBE.Infrastructure.Xendit.Models.Subscriptions;

public class XenditSubscriptionResponse
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("reference_id")] public string ReferenceId { get; set; } = string.Empty;
    [JsonPropertyName("plan_id")] public string PlanId { get; set; } = string.Empty;
    [JsonPropertyName("customer_id")] public string CustomerId { get; set; } = string.Empty;
    [JsonPropertyName("payment_method_id")] public string? PaymentMethodId { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    [JsonPropertyName("created")] public DateTime Created { get; set; }
    [JsonPropertyName("updated")] public DateTime Updated { get; set; }
    
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
