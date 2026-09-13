using FluentAssertions;
using FluentValidation;
using MediatR;
using NSubstitute;
using ClinicEz.Patient.Application.Common.Behaviors;

namespace ClinicEz.Patient.Application.Tests.Common.Behaviors;

// ── Test types scoped to this file only ──────────────────────────────────────

file sealed record ValidatableRequest(string Name) : IRequest<string>;

file sealed class ValidatableRequestValidator : AbstractValidator<ValidatableRequest>
{
    public ValidatableRequestValidator() =>
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

public sealed class ValidationBehaviorTests
{
    [Fact]
    public async Task Handle_WhenValidationPasses_CallsNextAndReturnsResult()
    {
        // Arrange
        var validators = new IValidator<ValidatableRequest>[] { new ValidatableRequestValidator() };
        var behavior = new ValidationBehavior<ValidatableRequest, string>(validators);

        var nextCalled = false;
        RequestHandlerDelegate<string> next = _ =>
        {
            nextCalled = true;
            return Task.FromResult("ok");
        };

        // Act
        var result = await behavior.Handle(new ValidatableRequest("hello"), next, CancellationToken.None);

        // Assert
        result.Should().Be("ok");
        nextCalled.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WhenValidationFails_ThrowsValidationExceptionWithErrors()
    {
        // Arrange
        var validators = new IValidator<ValidatableRequest>[] { new ValidatableRequestValidator() };
        var behavior = new ValidationBehavior<ValidatableRequest, string>(validators);

        RequestHandlerDelegate<string> next = _ => Task.FromResult("never");

        // Act
        Func<Task> act = async () =>
            await behavior.Handle(new ValidatableRequest(""), next, CancellationToken.None);

        // Assert
        var assertion = await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>();
        assertion.Which.Errors.Should().ContainKey("Name");
    }

    [Fact]
    public async Task Handle_WhenNoValidators_SkipsValidationAndCallsNext()
    {
        // Arrange — empty validator list
        var behavior = new ValidationBehavior<ValidatableRequest, string>([]);

        var nextCalled = false;
        RequestHandlerDelegate<string> next = _ =>
        {
            nextCalled = true;
            return Task.FromResult("ok");
        };

        // Act — even an invalid request must pass through
        var result = await behavior.Handle(new ValidatableRequest(""), next, CancellationToken.None);

        // Assert
        result.Should().Be("ok");
        nextCalled.Should().BeTrue();
    }
}
