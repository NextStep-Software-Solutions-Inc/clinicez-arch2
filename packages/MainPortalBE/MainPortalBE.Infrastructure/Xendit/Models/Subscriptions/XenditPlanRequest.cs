using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MainPortalBE.Infrastructure.Xendit.Models.Subscriptions;

public class XenditPlanRequest
{
    [JsonPropertyName("reference_id")] public string ReferenceId { get; set; } = string.Empty;
    [JsonPropertyName("amount")] public long Amount { get; set; }
    [JsonPropertyName("currency")] public string Currency { get; set; } = "PHP";
    [JsonPropertyName("interval")] public string Interval { get; set; } = "MONTH"; // DAY, WEEK, MONTH
    [JsonPropertyName("interval_count")] public int IntervalCount { get; set; } = 1;
    [JsonPropertyName("total_recurrence")] public int? TotalRecurrence { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("success_return_url")] public string? SuccessReturnUrl { get; set; }
    [JsonPropertyName("failure_return_url")] public string? FailureReturnUrl { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
