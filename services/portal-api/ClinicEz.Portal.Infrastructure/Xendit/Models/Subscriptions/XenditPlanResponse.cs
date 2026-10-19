using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.Portal.Infrastructure.Xendit.Models.Subscriptions;

public class XenditAction
{
    [JsonPropertyName("action")] public string Action { get; set; } = string.Empty;
    [JsonPropertyName("url")] public string Url { get; set; } = string.Empty;
    [JsonPropertyName("method")] public string Method { get; set; } = string.Empty;
}

public class XenditPlanResponse
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("reference_id")] public string ReferenceId { get; set; } = string.Empty;
    [JsonPropertyName("amount")] public long Amount { get; set; }
    [JsonPropertyName("currency")] public string Currency { get; set; } = string.Empty;
    [JsonPropertyName("interval")] public string Interval { get; set; } = string.Empty;
    [JsonPropertyName("interval_count")] public int IntervalCount { get; set; }
    [JsonPropertyName("total_recurrence")] public int? TotalRecurrence { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("success_return_url")] public string? SuccessReturnUrl { get; set; }
    [JsonPropertyName("failure_return_url")] public string? FailureReturnUrl { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
    [JsonPropertyName("actions")] public List<XenditAction>? Actions { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    [JsonPropertyName("created")] public DateTime Created { get; set; }
    [JsonPropertyName("updated")] public DateTime Updated { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
