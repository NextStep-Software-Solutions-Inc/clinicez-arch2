using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;

public class XenditInvoiceRequest
{
    [JsonPropertyName("external_id")] public string ExternalId { get; set; } = string.Empty;
    [JsonPropertyName("amount")] public long Amount { get; set; }
    [JsonPropertyName("payer_email")] public string? PayerEmail { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("success_redirect_url")] public string? SuccessRedirectUrl { get; set; }
    [JsonPropertyName("failure_redirect_url")] public string? FailureRedirectUrl { get; set; }
    [JsonPropertyName("currency")] public string? Currency { get; set; }
    [JsonPropertyName("invoice_duration")] public int? InvoiceDuration { get; set; }
    [JsonPropertyName("payment_methods")] public List<string>? PaymentMethods { get; set; }
    [JsonPropertyName("customer")] public XenditCustomerObject? Customer { get; set; }
    [JsonPropertyName("customer_notification_preference")] public XenditNotificationPreference? CustomerNotificationPreference { get; set; }
    [JsonPropertyName("items")] public List<XenditItemObject>? Items { get; set; }
    [JsonPropertyName("fees")] public List<XenditFeeObject>? Fees { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}

public class XenditCustomerObject
{
    [JsonPropertyName("given_names")] public string? GivenNames { get; set; }
    [JsonPropertyName("surname")] public string? Surname { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("mobile_number")] public string? MobileNumber { get; set; }
    [JsonPropertyName("addresses")] public List<XenditAddressObject>? Addresses { get; set; }
}

public class XenditItemObject
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("quantity")] public int Quantity { get; set; }
    [JsonPropertyName("price")] public long Price { get; set; }
    [JsonPropertyName("category")] public string? Category { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
}

public class XenditFeeObject
{
    [JsonPropertyName("type")] public string Type { get; set; } = string.Empty;
    [JsonPropertyName("value")] public long Value { get; set; }
}

public class XenditNotificationPreference
{
    [JsonPropertyName("invoice_created")] public List<string>? InvoiceCreated { get; set; }
    [JsonPropertyName("invoice_reminder")] public List<string>? InvoiceReminder { get; set; }
    [JsonPropertyName("invoice_paid")] public List<string>? InvoicePaid { get; set; }
}

public class XenditAddressObject
{
    [JsonPropertyName("country")] public string? Country { get; set; }
    [JsonPropertyName("street_line1")] public string? StreetLine1 { get; set; }
    [JsonPropertyName("street_line2")] public string? StreetLine2 { get; set; }
    [JsonPropertyName("city")] public string? City { get; set; }
    [JsonPropertyName("province_state")] public string? ProvinceState { get; set; }
    [JsonPropertyName("postal_code")] public string? PostalCode { get; set; }
}
