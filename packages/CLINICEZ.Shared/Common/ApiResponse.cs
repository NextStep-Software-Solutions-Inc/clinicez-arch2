namespace CLINICEZ.Shared.Common;

public class ApiResponse<T>
{
    public bool Succeeded { get; set; }

    public string? Message { get; set; }

    public T? Data { get; set; }

    public static ApiResponse<T> Success(T data, string? message = null)
    {
        return new ApiResponse<T> { Succeeded = true, Data = data, Message = message };
    }

    public static ApiResponse<T> Fail(string message)
    {
        // When failing, Data will correctly be null by default.
        return new ApiResponse<T> { Succeeded = false, Message = message };
    }
}