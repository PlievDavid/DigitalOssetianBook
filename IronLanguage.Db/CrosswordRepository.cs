using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class CrosswordSolvedWord
{
    public Guid UserId { get; set; }
    public int LevelId { get; set; }
    public int Version { get; set; }
    public int WordId { get; set; }
}

public interface ICrosswordRepository
{
    Task<List<CrosswordSolvedWord>> Solved(Guid userId, CancellationToken ct);
    Task Save(Guid userId, int levelId, int version, IEnumerable<int> wordIds, CancellationToken ct);
}

public sealed class EfCrosswordRepository(AdamDbContext db) : ICrosswordRepository
{
    public Task<List<CrosswordSolvedWord>> Solved(Guid userId, CancellationToken ct) =>
        db.CrosswordSolvedWords.AsNoTracking().Where(x => x.UserId == userId).ToListAsync(ct);

    public async Task Save(Guid userId, int levelId, int version, IEnumerable<int> wordIds, CancellationToken ct)
    {
        // Independent, idempotent inserts merge progress from concurrent tabs without losing words.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var wordId in wordIds.Distinct())
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"CrosswordSolvedWords\" (\"UserId\", \"LevelId\", \"Version\", \"WordId\") VALUES ({userId}, {levelId}, {version}, {wordId}) ON CONFLICT DO NOTHING", ct);
        await tx.CommitAsync(ct);
    }
}
