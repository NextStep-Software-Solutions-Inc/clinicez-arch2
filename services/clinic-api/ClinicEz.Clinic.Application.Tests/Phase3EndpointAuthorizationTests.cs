using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Domain.Constants;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Every state-changing or PHI-reading endpoint added for the clinical flows is permission-guarded.</summary>
public class Phase3EndpointAuthorizationTests
{
    private static readonly Type[] MutatingVerbs = [typeof(HttpPostAttribute), typeof(HttpPutAttribute), typeof(HttpPatchAttribute), typeof(HttpDeleteAttribute)];

    private static MethodInfo Action(Type controller, string name) =>
        controller.GetMethod(name) ?? throw new InvalidOperationException($"{controller.Name}.{name} was not found.");

    private static string[] Permissions(MethodInfo action) =>
        action.GetCustomAttributes<HasPermissionAttribute>(true)
            .Concat(action.DeclaringType!.GetCustomAttributes<HasPermissionAttribute>(true))
            .Select(a => a.Permission)
            .ToArray();

    [Fact]
    public void Reviewing_A_Result_Needs_The_Review_Permission_And_Is_Never_Anonymous()
    {
        var review = Action(typeof(LabResultsController), nameof(LabResultsController.Review));

        Permissions(review).Should().Equal(ClinicPermissions.LabResultsReview);
        review.GetCustomAttribute<AllowAnonymousAttribute>().Should().BeNull();
    }

    [Fact]
    public void Reading_The_Review_Inbox_And_Result_Files_Needs_Lab_Order_Read()
    {
        Permissions(Action(typeof(LabResultsController), nameof(LabResultsController.GetReviewQueue))).Should().Equal(ClinicPermissions.LabOrdersRead);
        Permissions(Action(typeof(LabResultsController), nameof(LabResultsController.GetFile))).Should().Equal(ClinicPermissions.LabOrdersRead);
    }

    [Fact]
    public void Redeeming_A_Share_Needs_Patient_Write_And_Reading_Its_Status_Needs_Patient_Read()
    {
        Permissions(Action(typeof(PatientsController), nameof(PatientsController.RedeemShare))).Should().Equal(ClinicPermissions.PatientsWrite);
        Permissions(Action(typeof(PatientsController), nameof(PatientsController.GetShareStatus))).Should().Equal(ClinicPermissions.PatientsRead);
    }

    [Fact]
    public void The_Review_Permission_Is_Part_Of_The_Full_Permission_Set()
    {
        ClinicPermissions.All.Should().Contain(ClinicPermissions.LabResultsReview);
    }

    [Fact]
    public void Every_Mutating_Action_Of_The_New_Controllers_Is_Guarded_Or_Explicitly_Anonymous()
    {
        var unguarded = new List<string>();
        foreach (var controller in new[] { typeof(LabResultsController), typeof(PatientsController) })
        {
            foreach (var action in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var isMutating = MutatingVerbs.Any(verb => action.IsDefined(verb, true));
                var isAnonymous = action.IsDefined(typeof(AllowAnonymousAttribute), true);
                if (isMutating && !isAnonymous && Permissions(action).Length == 0 && !action.IsDefined(typeof(AuthorizeAttribute), true))
                {
                    unguarded.Add($"{controller.Name}.{action.Name}");
                }
            }
        }

        unguarded.Should().BeEmpty();
    }
}
