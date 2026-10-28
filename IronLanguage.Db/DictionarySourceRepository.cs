using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public interface IDictionarySourceRepository
{
    Task<Guid?> FindSense(int sourceRow, int sourceColumn, string searchKey, CancellationToken ct = default);
    Task<Guid?> EnsureSense(DictionarySense sense, string searchKey, CancellationToken ct = default);
}

public sealed class EfDictionarySourceRepository(AdamDbContext db) : IDictionarySourceRepository
{
    public async Task<Guid?> EnsureSense(DictionarySense sense, string searchKey, CancellationToken ct = default)
    {
        var existing = await FindSense(sense.SourceRow, sense.SourceColumn, searchKey, ct);
        if (existing is not null) return existing;
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DictionarySenses\" (\"Id\", \"SourceRow\", \"SourceColumn\", \"Ossetian\", \"Russian\", \"RussianHeadword\", \"Note\", \"Active\") VALUES ({sense.Id}, {sense.SourceRow}, {sense.SourceColumn}, {sense.Ossetian}, {sense.Russian}, {sense.RussianHeadword}, {sense.Note}, {true}) ON CONFLICT (\"Id\") DO NOTHING", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DictionaryForms\" (\"SenseId\", \"SearchKey\") VALUES ({sense.Id}, {searchKey}) ON CONFLICT DO NOTHING", ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return await FindSense(sense.SourceRow, sense.SourceColumn, searchKey, ct);
    }

    public Task<Guid?> FindSense(int sourceRow, int sourceColumn, string searchKey, CancellationToken ct = default) =>
        db.DictionaryForms.AsNoTracking()
            .Where(form => form.SearchKey == searchKey && form.Sense.Active && form.Sense.SourceRow == sourceRow && form.Sense.SourceColumn == sourceColumn)
            .Select(form => (Guid?)form.SenseId).SingleOrDefaultAsync(ct);
}
