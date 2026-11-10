using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class CourseRating
{
    public Guid CourseId { get; set; }
    public Guid UserId { get; set; }
    public int Score { get; set; }
}

public sealed record CourseRatingSummary(double? Average, int Count, int? UserScore);

public interface ICourseRatingRepository
{
    Task<CourseRatingSummary> Summary(Guid courseId, Guid? userId, CancellationToken ct);
    Task<Dictionary<Guid, CourseRatingSummary>> Summaries(Guid[] courseIds, CancellationToken ct);
    Task<bool> Set(Guid courseId, Guid userId, int score, CancellationToken ct);
}

public sealed class EfCourseRatingRepository(AdamDbContext db) : ICourseRatingRepository
{
    public Task<Dictionary<Guid, CourseRatingSummary>> Summaries(Guid[] courseIds, CancellationToken ct) =>
        db.CourseRatings.AsNoTracking().Where(x => courseIds.Contains(x.CourseId))
            .GroupBy(x => x.CourseId)
            .Select(g => new { Id = g.Key, Count = g.Count(), Average = g.Average(x => (double)x.Score) })
            .ToDictionaryAsync(x => x.Id, x => new CourseRatingSummary(x.Average, x.Count, null), ct);

    public async Task<CourseRatingSummary> Summary(Guid courseId, Guid? userId, CancellationToken ct)
    {
        var query = db.CourseRatings.AsNoTracking().Where(x => x.CourseId == courseId);
        var aggregate = await query.GroupBy(_ => 1).Select(g => new { Count = g.Count(), Average = g.Average(x => (double)x.Score) }).SingleOrDefaultAsync(ct);
        var own = userId is Guid user ? await query.Where(x => x.UserId == user).Select(x => (int?)x.Score).SingleOrDefaultAsync(ct) : null;
        return new CourseRatingSummary(aggregate?.Average, aggregate?.Count ?? 0, own);
    }

    public async Task<bool> Set(Guid courseId, Guid userId, int score, CancellationToken ct)
    {
        if (score is < 1 or > 5) return false;
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "CourseRatings" ("CourseId", "UserId", "Score")
            SELECT {courseId}, {userId}, {score}
            WHERE EXISTS (SELECT 1 FROM "ContentRevisions" WHERE "Kind" = 'course' AND "ContentId" = {courseId} AND "Published")
            ON CONFLICT ("CourseId", "UserId") DO UPDATE SET "Score" = EXCLUDED."Score"
            """, ct);
        return affected > 0;
    }
}
