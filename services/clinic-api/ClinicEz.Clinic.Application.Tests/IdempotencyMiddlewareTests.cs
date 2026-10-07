using System.Security.Claims;
using System.Text;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Idempotency;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

public class IdempotencyMiddlewareTests
{
    private sealed class Harness
    {
        public ApplicationDbContext Db { get; }
        public int Executions { get; private set; }
        public int ResultStatus { get; set; } = StatusCodes.Status201Created;
        private readonly IdempotencyMiddleware _middleware;

        public Harness()
        {
            var clinicContext = Substitute.For<IClinicContext>();
            clinicContext.TenantId.Returns("tenant1");
            clinicContext.ClinicId.Returns(Guid.Empty);
            (Db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

            _middleware = new IdempotencyMiddleware(async ctx =>
            {
                Executions++;
                ctx.Response.StatusCode = ResultStatus;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsync($"{{\"run\":{Executions}}}");
            });
        }

        public async Task<(int Status, string Body, bool Replayed)> Send(
            string? key, string body = "{\"name\":\"Maria\"}", string subject = "staff-1", string method = "POST", bool authenticated = true)
        {
            var ctx = new DefaultHttpContext();
            ctx.Request.Method = method;
            ctx.Request.Path = "/api/v1/patients";
            ctx.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
            ctx.Request.ContentLength = body.Length;
            if (key is not null) ctx.Request.Headers[IdempotencyMiddleware.HeaderName] = key;
            if (authenticated)
            {
                ctx.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClinicClaimTypes.Subject, subject),
                    new Claim(ClinicClaimTypes.ClinicId, Guid.Empty.ToString()),
                }, "test"));
            }
            var responseBody = new MemoryStream();
            ctx.Response.Body = responseBody;

            await _middleware.InvokeAsync(ctx, Db);

            responseBody.Position = 0;
            var text = Encoding.UTF8.GetString(responseBody.ToArray());
            return (ctx.Response.StatusCode, text, ctx.Response.Headers.ContainsKey(IdempotencyMiddleware.ReplayHeaderName));
        }
    }

    [Fact]
    public async Task First_request_runs_and_is_stored()
    {
        var h = new Harness();
        var result = await h.Send("key-1");

        result.Status.Should().Be(201);
        result.Body.Should().Be("{\"run\":1}");
        result.Replayed.Should().BeFalse();
        h.Executions.Should().Be(1);
        (await h.Db.Set<IdempotencyRecord>().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Same_key_and_request_replays_the_stored_response_without_running_again()
    {
        var h = new Harness();
        await h.Send("key-1");
        var second = await h.Send("key-1");

        h.Executions.Should().Be(1);
        second.Status.Should().Be(201);
        second.Body.Should().Be("{\"run\":1}");
        second.Replayed.Should().BeTrue();
    }

    [Fact]
    public async Task Same_key_with_a_different_body_is_rejected_as_key_reuse()
    {
        var h = new Harness();
        await h.Send("key-1", "{\"name\":\"Maria\"}");
        var second = await h.Send("key-1", "{\"name\":\"Jose\"}");

        second.Status.Should().Be(422);
        h.Executions.Should().Be(1);
    }

    [Fact]
    public async Task Failed_responses_are_not_stored_so_the_client_can_retry()
    {
        var h = new Harness { ResultStatus = StatusCodes.Status500InternalServerError };
        await h.Send("key-1");
        (await h.Db.Set<IdempotencyRecord>().CountAsync()).Should().Be(0);

        h.ResultStatus = StatusCodes.Status201Created;
        var retry = await h.Send("key-1");
        retry.Status.Should().Be(201);
        retry.Replayed.Should().BeFalse();
        h.Executions.Should().Be(2);
    }

    [Fact]
    public async Task Requests_without_the_header_are_untouched()
    {
        var h = new Harness();
        await h.Send(null);
        await h.Send(null);

        h.Executions.Should().Be(2);
        (await h.Db.Set<IdempotencyRecord>().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Reads_and_unauthenticated_requests_are_untouched()
    {
        var h = new Harness();
        await h.Send("key-1", method: "GET");
        await h.Send("key-2", authenticated: false);

        h.Executions.Should().Be(2);
        (await h.Db.Set<IdempotencyRecord>().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Keys_are_scoped_per_user()
    {
        var h = new Harness();
        await h.Send("key-1", subject: "staff-1");
        var other = await h.Send("key-1", subject: "staff-2");

        other.Replayed.Should().BeFalse();
        h.Executions.Should().Be(2);
    }

    [Fact]
    public async Task A_malformed_key_is_rejected()
    {
        var h = new Harness();
        var result = await h.Send(new string('k', IdempotencyMiddleware.MaxKeyLength + 1));

        result.Status.Should().Be(400);
        h.Executions.Should().Be(0);
    }
}
