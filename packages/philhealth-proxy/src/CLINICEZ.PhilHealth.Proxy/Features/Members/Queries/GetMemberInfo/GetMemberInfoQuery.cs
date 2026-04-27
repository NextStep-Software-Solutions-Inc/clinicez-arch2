using CLINICEZ.PhilHealth.Proxy.Models;
using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Queries.GetMemberInfo;

/// <summary>Retrieves PhilHealth member information by PhilHealth Identification Number (PIN).</summary>
public sealed record GetMemberInfoQuery(string PhilHealthNumber) : IRequest<PhilHealthMemberInfo>;
