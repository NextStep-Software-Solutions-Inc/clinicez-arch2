using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;

namespace ClinicEz.Portal.Infrastructure.Xendit.Models.Customers;

public class XenditBusinessDetail
{
    [JsonPropertyName("business_name")] public string BusinessName { get; set; } = string.Empty;

    [JsonPropertyName("trading_name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TradingName { get; set; }

    [JsonPropertyName("business_type")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BusinessType { get; set; }
}

public class XenditIndividualDetail
{
    [JsonPropertyName("given_names")] public string GivenNames { get; set; } = string.Empty;
    [JsonPropertyName("surname")] public string? Surname { get; set; }
}

public class XenditCustomerRequest
{
    [JsonPropertyName("reference_id")] public string ReferenceId { get; set; } = string.Empty;
    
    [JsonPropertyName("type")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Type { get; set; } // INDIVIDUAL or BUSINESS

    [JsonPropertyName("email")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Email { get; set; }

    [JsonPropertyName("given_names")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? GivenNames { get; set; }

    [JsonPropertyName("surname")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Surname { get; set; }

    [JsonPropertyName("phone_number")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PhoneNumber { get; set; }

    [JsonPropertyName("nationality")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Nationality { get; set; }

    [JsonPropertyName("date_of_birth")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DateOfBirth { get; set; }

    [JsonPropertyName("individual_detail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public XenditIndividualDetail? IndividualDetail { get; set; }

    [JsonPropertyName("business_detail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public XenditBusinessDetail? BusinessDetail { get; set; }

    [JsonPropertyName("addresses")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<XenditAddressObject>? Addresses { get; set; }

    [JsonPropertyName("metadata")] 
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object>? Metadata { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}
