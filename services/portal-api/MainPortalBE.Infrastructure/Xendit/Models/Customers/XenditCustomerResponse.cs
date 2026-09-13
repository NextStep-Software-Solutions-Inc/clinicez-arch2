using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using MainPortalBE.Infrastructure.Xendit.Models.Invoices;

namespace MainPortalBE.Infrastructure.Xendit.Models.Customers;

public class XenditCustomerResponse
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("reference_id")] public string ReferenceId { get; set; } = string.Empty;
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("given_names")] public string? GivenNames { get; set; }
    [JsonPropertyName("surname")] public string? Surname { get; set; }
    [JsonPropertyName("phone_number")] public string? PhoneNumber { get; set; }
    [JsonPropertyName("nationality")] public string? Nationality { get; set; }
    [JsonPropertyName("date_of_birth")] public string? DateOfBirth { get; set; }
    [JsonPropertyName("addresses")] public List<XenditAddressObject>? Addresses { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, object>? Metadata { get; set; }
    [JsonPropertyName("created")] public DateTime Created { get; set; }
    [JsonPropertyName("updated")] public DateTime Updated { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
