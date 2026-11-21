using System;
using System.Collections.Generic;
using System.Linq;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

/// <summary>
/// Lightweight discriminated union for wire builder execution results.
/// </summary>
public readonly struct Result<T>
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public T? Value { get; }
    public IReadOnlyList<string> Errors { get; }
    public string? Error => Errors.Count > 0 ? Errors[0] : null;

    private Result(bool isSuccess, T? value, IReadOnlyList<string>? errors)
    {
        IsSuccess = isSuccess;
        Value = value;
        Errors = errors ?? Array.Empty<string>();
    }

    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, new[] { error });
    public static Result<T> Failure(IEnumerable<string> errors) => new(false, default, errors.ToList());
}

/// <summary>
/// Canonical contract for PCAPI v2.0 wire payload builders.
/// Transforms 1NF domain models into official PhilHealth wire JSON structures.
/// </summary>
public interface IYakapWireBuilder<in TContext, TPayload>
{
    Result<TPayload> BuildWirePayload(TContext context);
}
