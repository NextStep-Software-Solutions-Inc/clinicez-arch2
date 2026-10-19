using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;

public class XenditInvoiceResponse
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("external_id")] public string ExternalId { get; set; } = string.Empty;
    [JsonPropertyName("user_id")] public string UserId { get; set; } = string.Empty;
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
    [JsonPropertyName("merchant_name")] public string? MerchantName { get; set; }
    [JsonPropertyName("merchant_profile_picture_url")] public string? MerchantProfilePictureUrl { get; set; }
    [JsonPropertyName("amount")] public long Amount { get; set; }
    [JsonPropertyName("payer_email")] public string? PayerEmail { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("invoice_url")] public string InvoiceUrl { get; set; } = string.Empty;
    [JsonPropertyName("expiry_date")] public DateTime ExpiryDate { get; set; }
    [JsonPropertyName("success_redirect_url")] public string? SuccessRedirectUrl { get; set; }
    [JsonPropertyName("failure_redirect_url")] public string? FailureRedirectUrl { get; set; }
    [JsonPropertyName("currency")] public string? Currency { get; set; }
    [JsonPropertyName("items")] public List<XenditItemObject>? Items { get; set; }
    [JsonPropertyName("fees")] public List<XenditFeeObject>? Fees { get; set; }
    [JsonPropertyName("customer")] public XenditCustomerObject? Customer { get; set; }
    [JsonPropertyName("customer_notification_preference")] public XenditNotificationPreference? CustomerNotificationPreference { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    [JsonPropertyName("created")] public DateTime Created { get; set; }
    [JsonPropertyName("updated")] public DateTime Updated { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
