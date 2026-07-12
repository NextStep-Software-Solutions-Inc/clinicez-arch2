using EFCore.BulkExtensions;
using MainPortalBE.Domain.Common;
using MainPortalBE.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Sieve.Models;
using Sieve.Services;
using System.Linq.Expressions;

namespace MainPortalBE.Infrastructure.Persistence.Repositories;

public class Repository<T>(ApplicationDbContext context, ISieveProcessor sieveProcessor) : IRepository<T> where T : BaseEntity
{
    public async Task AddAsync(T entity, CancellationToken cancellationToken = default)
    {
        await context.Set<T>().AddAsync(entity, cancellationToken);
    }

    public async Task<(IReadOnlyList<T> Entities, int TotalCount)> GetAllAsync(SieveModel sieveModel, CancellationToken cancellationToken = default)
    {
        IQueryable<T> query = context.Set<T>().AsNoTracking();

        var filteredQuery = sieveProcessor.Apply(sieveModel, query, applyPagination: false);

        var totalCount = await filteredQuery.CountAsync(cancellationToken);

        var paginatedResult = sieveProcessor.Apply(sieveModel, filteredQuery, applyFiltering: false, applySorting: false);

        var entities = await paginatedResult.ToListAsync(cancellationToken);

        return (entities, totalCount);
    }

    public async Task<(IReadOnlyList<TDto> Entities, int TotalCount)> GetAllAsync<TDto>(SieveModel sieveModel, Expression<Func<T, TDto>> projection, CancellationToken cancellationToken = default)
    {

        IQueryable<T> query = context.Set<T>().AsNoTracking();

        var filteredQuery = sieveProcessor.Apply(sieveModel, query, applyPagination: false);

        var totalCount = await filteredQuery.CountAsync(cancellationToken);

        var paginatedResult = sieveProcessor.Apply(sieveModel, filteredQuery, applyFiltering: false, applySorting: false);

        var entities = await paginatedResult.Select(projection).ToListAsync(cancellationToken);

        return (entities, totalCount);
    }
    public async Task<(IReadOnlyList<TDto> Entities, int TotalCount)> GetAllAsync<TDto>(SieveModel sieveModel, Expression<Func<T, TDto>> projection, Expression<Func<T, bool>> customFilter, CancellationToken cancellationToken = default)
    {

        IQueryable<T> query = context.Set<T>().AsNoTracking();

        query = query.Where(customFilter);

        var filteredQuery = sieveProcessor.Apply(sieveModel, query, applyPagination: false);

        var totalCount = await filteredQuery.CountAsync(cancellationToken);

        var paginatedResult = sieveProcessor.Apply(sieveModel, filteredQuery, applyFiltering: false, applySorting: false);

        var entities = await paginatedResult.Select(projection).ToListAsync(cancellationToken);

        return (entities, totalCount);
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Set<T>().FirstOrDefaultAsync(e => EF.Property<Guid>(e, "Id") == id, cancellationToken);
    }

    public async Task<T?> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default)
    {
        return await context.Set<T>().FirstOrDefaultAsync(predicate, cancellationToken);
    }

    public void Remove(T entity, bool hardDelete = false)
    {
        entity.AllowHardDelete = hardDelete;
        context.Set<T>().Remove(entity);

    }

    public void Update(T entity)
    {
        context.Set<T>().Update(entity);
    }

    public async Task AddBulkAsync(IList<T> entities, CancellationToken cancellationToken = default)
    {
        await context.BulkInsertAsync(entities, cancellationToken: cancellationToken);
    }
    public async Task AddRangeAsync(IList<T> entities, CancellationToken cancellationToken = default)
    {
        await context.Set<T>().AddRangeAsync(entities, cancellationToken);
    }
    public async Task UpdateBulkAsync(IList<T> entities, CancellationToken cancellationToken = default)
    {
        await context.BulkUpdateAsync(entities, cancellationToken: cancellationToken);
    }

    public async Task DeleteBulkAsync(IList<T> entities, CancellationToken cancellationToken = default)
    {
        await context.BulkDeleteAsync(entities, cancellationToken: cancellationToken);
    }

    public IQueryable<T> Query(Expression<Func<T, bool>>? predicate = null, bool? ignoreQueryFilters = false)
    {
        IQueryable<T> query = context.Set<T>();
        if (ignoreQueryFilters == true) query = query.IgnoreQueryFilters();
        if (predicate != null) query = query.Where(predicate);

        return query;
    }

    public IQueryable<T> IgnoreQueryFilters()
    {
        return context.Set<T>().IgnoreQueryFilters();
    }

    public async Task<List<T>> ToListAsync(IQueryable<T> query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await query.ToListAsync(cancellationToken);
    }

    public Task<TEntity?> GetSingleAsync<TEntity>(IQueryable<TEntity> query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        return query.SingleOrDefaultAsync(cancellationToken);
    }

    public Task<TEntity?> GetFirstAsync<TEntity>(IQueryable<TEntity> query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        return query.FirstOrDefaultAsync(cancellationToken);
    }
}
