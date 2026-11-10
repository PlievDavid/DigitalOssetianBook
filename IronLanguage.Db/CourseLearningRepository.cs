using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class CourseLessonSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid CourseId { get; set; }
    public Guid VersionId { get; set; }
    public Guid LessonId { get; set; }
    public string AttemptIdsJson { get; set; } = "[]";
    public int Step { get; set; }
    public int[] CompletedSteps { get; set; } = [];
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class CoursePracticeRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string StateJson { get; set; } = "{}";
    public int Revision { get; set; }
    public bool Complete { get; set; }
}

public sealed class CourseBlockActivity
{
    public Guid UserId { get; set; }
    public Guid VersionId { get; set; }
    public Guid BlockId { get; set; }
    public string Key { get; set; } = "";
    public Guid CourseId { get; set; }
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
    public bool? Correct { get; set; }
}

public sealed record CourseLearner(Guid Id, string Name);

public interface ICourseLearningRepository
{
    Task<CourseVersion?> Snapshot(Guid version, CancellationToken ct);
    Task<string?> BlockReason(Guid course, CancellationToken ct);
    Task<List<Course>> Owned(Guid user, CancellationToken ct);
    Task<List<CourseVersion>> Published(CancellationToken ct);
    Task<CourseVersion?> Version(Guid course, Guid? user, CancellationToken ct);
    Task<List<CourseLessonSession>> Sessions(Guid user, Guid course, CancellationToken ct);
    Task<CourseLessonSession?> Session(Guid user, Guid id, CancellationToken ct);
    Task<CourseLessonSession?> Start(CourseLessonSession session, List<ExerciseAttempt> attempts, CancellationToken ct, List<CoursePracticeRun>? practices = null);
    Task<CoursePracticeRun?> Practice(Guid user, Guid id, CancellationToken ct);
    Task<bool> SavePractice(CoursePracticeRun run, int revision, CancellationToken ct);
    Task<bool> Advance(Guid user, Guid id, int step, int count, Guid? attempt, CancellationToken ct);
    Task<bool> Archive(Guid course, Guid owner, CancellationToken ct);
    Task<bool> Retry(CourseLessonSession session, int index, Guid expectedAttempt, ExerciseAttempt replacement, CancellationToken ct);
    Task<List<CourseEnrollment>> Enrollments(Guid user, CancellationToken ct);
    Task<CourseVersion[]> Mine(Guid user, CancellationToken ct);
    Task<CourseVersion[]> Snapshots(Guid[] versions, CancellationToken ct);
    Task<CourseLessonSession[]> History(Guid[] courseIds, Guid? user, CancellationToken ct);
    Task<CourseLearner[]> Learners(Guid course, CancellationToken ct);
    Task<CourseBlockActivity[]> Activity(Guid course, CancellationToken ct);
    Task Record(CourseLessonSession session, Guid block, string key, bool? correct, CancellationToken ct);
    Task<Dictionary<Guid, string>> AuthorNames(Guid[] courses, CancellationToken ct);
}

public sealed class EfCourseLearningRepository(AdamDbContext db) : ICourseLearningRepository
{
    public Task<CourseVersion?> Snapshot(Guid version, CancellationToken ct) => db.CourseVersions.AsNoTracking().SingleOrDefaultAsync(v => v.Id == version, ct);
    public Task<string?> BlockReason(Guid course, CancellationToken ct) =>
        db.Courses.Where(c => c.Id == course).Select(c => c.BlockReason).SingleOrDefaultAsync(ct);
    public Task<Dictionary<Guid, string>> AuthorNames(Guid[] courses, CancellationToken ct) =>
        (from c in db.Courses.AsNoTracking() join u in db.Users.AsNoTracking() on c.OwnerId equals u.Id
         where courses.Contains(c.Id) select new { c.Id, Name = u.PublicName ?? "Автор курса" }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
    public Task<List<Course>> Owned(Guid user, CancellationToken ct) => db.Courses.AsNoTracking().Where(x => x.OwnerId == user).OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
    public Task<List<CourseVersion>> Published(CancellationToken ct) => db.CourseVersions.AsNoTracking()
        .Where(v => db.Courses.Any(c => c.Id == v.CourseId && c.PublishedVersionId == v.Id && !c.Archived && c.BlockReason == null)).OrderByDescending(v => v.PublishedAt).ToListAsync(ct);
    public async Task<CourseVersion?> Version(Guid course, Guid? user, CancellationToken ct)
    {
        var enrolled = user is Guid uid && await db.CourseEnrollments.AnyAsync(e => e.CourseId == course && e.UserId == uid, ct);
        return await db.CourseVersions.AsNoTracking().SingleOrDefaultAsync(v => v.CourseId == course &&
            db.Courses.Any(c => c.Id == course && c.BlockReason == null && (!c.Archived || enrolled) && c.PublishedVersionId == v.Id), ct);
    }
    public Task<List<CourseEnrollment>> Enrollments(Guid user, CancellationToken ct) => db.CourseEnrollments.AsNoTracking().Where(x => x.UserId == user).ToListAsync(ct);
    public Task<CourseVersion[]> Mine(Guid user, CancellationToken ct) =>
        (from enrollment in db.CourseEnrollments
         join course in db.Courses on enrollment.CourseId equals course.Id
         join version in db.CourseVersions.AsNoTracking() on course.PublishedVersionId equals (Guid?)version.Id
         where enrollment.UserId == user && course.BlockReason == null
         select version).ToArrayAsync(ct);
    public Task<CourseVersion[]> Snapshots(Guid[] versions, CancellationToken ct) =>
        db.CourseVersions.AsNoTracking().Where(v => versions.Contains(v.Id)).ToArrayAsync(ct);
    public Task<CourseLessonSession[]> History(Guid[] courseIds, Guid? user, CancellationToken ct) =>
        db.CourseLessonSessions.AsNoTracking().Where(s => courseIds.Contains(s.CourseId) && (user == null || s.UserId == user))
            .OrderByDescending(s => s.StartedAt).ToArrayAsync(ct);
    public Task<CourseLearner[]> Learners(Guid course, CancellationToken ct) =>
        (from enrollment in db.CourseEnrollments
         join account in db.Users on enrollment.UserId equals account.Id
         where enrollment.CourseId == course
         select new CourseLearner(account.Id, account.PublicName ?? "Ученик")).ToArrayAsync(ct);
    public Task<CourseBlockActivity[]> Activity(Guid course, CancellationToken ct) =>
        db.CourseBlockActivities.AsNoTracking().Where(x => x.CourseId == course).OrderBy(x => x.At).ToArrayAsync(ct);
    public async Task Record(CourseLessonSession session, Guid block, string key, bool? correct, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await EfCourseRepository.Lock(db, session.CourseId, ct, shared: true);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "CourseBlockActivities" ("UserId", "CourseId", "VersionId", "BlockId", "Key", "At", "Correct")
            SELECT "UserId", "CourseId", "VersionId", {block}, {key}, {DateTimeOffset.UtcNow}, {correct}::boolean
            FROM "CourseLessonSessions" WHERE "Id" = {session.Id}
            ON CONFLICT DO NOTHING
            """, ct);
        await tx.CommitAsync(ct);
    }
    public Task<List<CourseLessonSession>> Sessions(Guid user, Guid course, CancellationToken ct) => db.CourseLessonSessions.AsNoTracking()
        .Where(x => x.UserId == user && x.CourseId == course).OrderByDescending(x => x.StartedAt).ToListAsync(ct);
    public Task<CourseLessonSession?> Session(Guid user, Guid id, CancellationToken ct) => db.CourseLessonSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct);
    public async Task<CourseLessonSession?> Start(CourseLessonSession session, List<ExerciseAttempt> attempts, CancellationToken ct, List<CoursePracticeRun>? practices = null)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await EfCourseRepository.Lock(db, session.CourseId, ct, shared: true);
        if (!await db.CourseVersions.AnyAsync(v => v.Id == session.VersionId && v.CourseId == session.CourseId, ct)) return null;
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"course-session:{session.UserId}:{session.VersionId}:{session.LessonId}"}, 0))", ct);
        var active = await db.CourseLessonSessions.AsNoTracking().Where(x => x.UserId == session.UserId && x.VersionId == session.VersionId && x.LessonId == session.LessonId && (x.CompletedAt == null || session.CompletedAt != null)).OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(ct);
        if (active is not null) return active;
        db.CourseLessonSessions.Add(session); db.Attempts.AddRange(attempts);
        if (practices is not null) db.CoursePracticeRuns.AddRange(practices);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return session;
    }
    public async Task<bool> Advance(Guid user, Guid id, int step, int count, Guid? attempt, CancellationToken ct)
    {
        if (step < 0 || step >= count) return false;
        if (attempt is Guid aid &&
            !await db.Attempts.AnyAsync(x => x.Id == aid && x.UserId == user && x.CompletedAt != null && x.Correct == true, ct) &&
            !await db.CoursePracticeRuns.AnyAsync(x => x.Id == aid && x.UserId == user && x.Complete, ct)) return false;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"course-progress:{id}"}, 0))", ct);
        var current = await Session(user, id, ct);
        if (current is null) return false;
        var completed = current.CompletedSteps.Concat(Enumerable.Range(0, current.Step)).Append(step).Distinct().Order().ToArray();
        var frontier = 0;
        while (completed.Contains(frontier) && frontier < count) frontier++;
        await db.CourseLessonSessions.Where(x => x.UserId == user && x.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CompletedSteps, completed).SetProperty(x => x.Step, frontier)
                .SetProperty(x => x.CompletedAt, frontier == count ? current.CompletedAt ?? DateTimeOffset.UtcNow : null), ct);
        await tx.CommitAsync(ct);
        return true;
    }
    public async Task<bool> Archive(Guid course, Guid owner, CancellationToken ct) =>
        await db.Courses.Where(x => x.Id == course && x.OwnerId == owner).ExecuteUpdateAsync(s => s.SetProperty(x => x.Archived, true), ct) == 1;

    public Task<CoursePracticeRun?> Practice(Guid user, Guid id, CancellationToken ct) =>
        db.CoursePracticeRuns.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct);

    public async Task<bool> SavePractice(CoursePracticeRun run, int revision, CancellationToken ct) =>
        await db.CoursePracticeRuns.Where(x => x.UserId == run.UserId && x.Id == run.Id && x.Revision == revision && !x.Complete)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StateJson, run.StateJson).SetProperty(x => x.Complete, run.Complete)
                .SetProperty(x => x.Revision, revision + 1), ct) == 1;

    public async Task<bool> Retry(CourseLessonSession session, int index, Guid expectedAttempt, ExerciseAttempt replacement, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await EfCourseRepository.Lock(db, session.CourseId, ct, shared: true);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"course-progress:{session.Id}"}, 0))", ct);
        var current = await Session(session.UserId, session.Id, ct);
        if (current is null) return false;
        var ids = System.Text.Json.JsonSerializer.Deserialize<Guid?[]>(current.AttemptIdsJson)!;
        if (index < 0 || index >= ids.Length) return false;
        if (ids[index] != expectedAttempt) return true; // A duplicate retry must not replace the new attempt.
        if (!await db.Attempts.AnyAsync(a => a.Id == expectedAttempt && a.UserId == session.UserId && a.CompletedAt != null && a.Correct == false, ct)) return false;
        ids[index] = replacement.Id;
        db.Attempts.Add(replacement);
        await db.SaveChangesAsync(ct);
        var json = System.Text.Json.JsonSerializer.Serialize(ids);
        await db.CourseLessonSessions.Where(s => s.Id == session.Id && s.UserId == session.UserId).ExecuteUpdateAsync(s => s.SetProperty(x => x.AttemptIdsJson, json), ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
