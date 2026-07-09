namespace Clinic EZ.Shared.Common;

public class PaginatedApiResponse<T>(List<T> data, int pageNumber, int pageSize, int totalCount)
{
    public bool Succeeded { get; set; } = true;
    public string? Message { get; set; }
    public List<T>? Data { get; set; } = data;
    public int PageNumber { get; set; } = pageNumber;
    public int PageSize { get; set; } = pageSize;
    public int TotalPages { get; set; } = (int)Math.Ceiling(totalCount / (double)pageSize);
    public int TotalCount { get; set; } = totalCount;
}