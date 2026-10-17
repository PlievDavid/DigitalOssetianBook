using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public interface IDictionarySourceRepository
{
    Task<Guid?> FindSense(int sourceRow, int sourceColumn, string searchKey, CancellationToken ct = default);
}

public sealed class EfDictionarySourceRepository(AdamDbContext db) : IDictionarySourceRepository
{
    public Task<Guid?> FindSense(int sourceRow, int sourceColumn, string searchKey, CancellationToken ct = default) =>
        db.DictionaryForms.AsNoTracking()
            .Where(form => form.SearchKey == searchKey && form.Sense.Active && form.Sense.SourceRow == sourceRow && form.Sense.SourceColumn == sourceColumn)
            .Select(form => (Guid?)form.SenseId).SingleOrDefaultAsync(ct);
}
