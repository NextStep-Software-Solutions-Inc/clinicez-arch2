using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace ClinicEz.Shared.Common;

/// <summary>Binds enum-typed query/route values by member name only (MVC's default binder also accepts <c>?status=1</c>).</summary>
public sealed class StringEnumModelBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext context)
    {
        var type = Nullable.GetUnderlyingType(context.Metadata.ModelType) ?? context.Metadata.ModelType;
        return type.IsEnum ? new StringEnumModelBinder(type, context.Metadata.IsNullableValueType) : null;
    }
}

internal sealed class StringEnumModelBinder(Type enumType, bool nullable) : IModelBinder
{
    public Task BindModelAsync(ModelBindingContext bindingContext)
    {
        var result = bindingContext.ValueProvider.GetValue(bindingContext.ModelName);
        if (result == ValueProviderResult.None) return Task.CompletedTask;

        bindingContext.ModelState.SetModelValue(bindingContext.ModelName, result);
        var text = result.FirstValue?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            if (nullable) bindingContext.Result = ModelBindingResult.Success(null);
            else Reject(bindingContext, "A value is required.");
            return Task.CompletedTask;
        }

        var name = Array.Find(Enum.GetNames(enumType), n => string.Equals(n, text, StringComparison.OrdinalIgnoreCase));
        if (name is null) Reject(bindingContext, $"'{text}' is not a valid {enumType.Name}; use one of: {string.Join(", ", Enum.GetNames(enumType))}.");
        else bindingContext.Result = ModelBindingResult.Success(Enum.Parse(enumType, name));
        return Task.CompletedTask;
    }

    private static void Reject(ModelBindingContext bindingContext, string message)
    {
        bindingContext.ModelState.TryAddModelError(bindingContext.ModelName, message);
        bindingContext.Result = ModelBindingResult.Failed();
    }
}
