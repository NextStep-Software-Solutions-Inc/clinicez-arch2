using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Api.Controllers;
using ClinicEz.Comms.Application.Features.Conversations.Commands;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class FacilityChannelCreationTests
{
    [Fact]
    public async Task CreateConversationCommandHandler_FacilityDepartment_CreatesSuccessfullyWithNullCategory()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new CreateConversationCommandHandler(db);

        var cmd = new CreateConversationCommand(
            TenantId: "tenant-metro",
            FacilityId: "fac-metro-1",
            BranchId: null,
            Scope: ConversationScope.Facility,
            Kind: ConversationKind.General,
            Title: "Room 1 Channel",
            ContextType: "Department",
            ContextId: "Room 1",
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-1",
            Participants: null);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(ConversationScope.Facility, result.Scope);
        Assert.Equal("Room 1 Channel", result.Title);
        Assert.Equal("Department", result.ContextType);
        Assert.Equal("Room 1", result.ContextId);
        Assert.Null(result.Category);

        var persisted = await db.Conversations.FirstOrDefaultAsync(c => c.Id == result.Id);
        Assert.NotNull(persisted);
        Assert.Equal("Department", persisted.ContextType);
        Assert.Equal("Room 1", persisted.ContextId);
        Assert.Null(persisted.Category);
    }

    [Fact]
    public async Task CreateConversationCommandHandler_StaffCareTeam_CreatesSuccessfullyWithPatientContext()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new CreateConversationCommandHandler(db);

        var cmd = new CreateConversationCommand(
            TenantId: "tenant-metro",
            FacilityId: "fac-metro-1",
            BranchId: null,
            Scope: ConversationScope.StaffContext,
            Kind: ConversationKind.General,
            Title: "Care Team: Juan dela Cruz",
            ContextType: "Patient",
            ContextId: "pat-999",
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-1",
            Participants: null);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(ConversationScope.StaffContext, result.Scope);
        Assert.Equal("Care Team: Juan dela Cruz", result.Title);
        Assert.Equal("Patient", result.ContextType);
        Assert.Equal("pat-999", result.ContextId);
        Assert.Null(result.Category);
    }

    [Fact]
    public void CreateConversationRequest_JsonDeserialization_ValidatesStrictEnumBehavior()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web).UseStrictStringEnums();

        // 1. Valid payload with category null and department context (Facility Channel fix)
        var validJson = """
        {
            "tenantId": "tenant-metro",
            "facilityId": "fac-metro-1",
            "scope": "Facility",
            "kind": "General",
            "title": "Room 1 Channel",
            "contextType": "Department",
            "contextId": "Room 1",
            "category": null,
            "isEmergencyConfirmed": false,
            "isLocalOnly": false
        }
        """;

        var request = JsonSerializer.Deserialize<CreateConversationRequest>(validJson, options);
        Assert.NotNull(request);
        Assert.Equal(ConversationScope.Facility, request.Scope);
        Assert.Equal("Department", request.ContextType);
        Assert.Equal("Room 1", request.ContextId);
        Assert.Null(request.Category);

        // 2. Valid payload with valid MessageCategory enum value
        var validWithEnumJson = """
        {
            "tenantId": "tenant-metro",
            "facilityId": "fac-metro-1",
            "scope": "Facility",
            "kind": "General",
            "title": "Billing Channel",
            "category": "Billing",
            "isEmergencyConfirmed": false,
            "isLocalOnly": false
        }
        """;

        var requestWithEnum = JsonSerializer.Deserialize<CreateConversationRequest>(validWithEnumJson, options);
        Assert.NotNull(requestWithEnum);
        Assert.Equal(MessageCategory.Billing, requestWithEnum.Category);

        // 3. Regressive buggy payload with free-text department in category enum throws JsonException (Root Cause proof)
        var buggyJson = """
        {
            "tenantId": "tenant-metro",
            "facilityId": "fac-metro-1",
            "scope": "Facility",
            "kind": "General",
            "title": "Room 1 Channel",
            "category": "Room 1",
            "isEmergencyConfirmed": false,
            "isLocalOnly": false
        }
        """;

        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<CreateConversationRequest>(buggyJson, options));
    }
}
