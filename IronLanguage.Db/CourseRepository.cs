using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class Course
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OwnerId { get; set; }
    public bool Archived { get; set; }
    public string? BlockReason { get; set; }
    public Guid? PublishedVersionId { get; set; }
    public long DraftStamp { get; set; }
    public string DraftJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CourseVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CourseId { get; set; }
    public int Number { get; set; }
    public long SourceDraftStamp { get; set; }
    public string SnapshotJson { get; set; } = "{}";
    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record CourseAccessState(bool Archived, string? BlockReason);

public sealed class CourseEnrollment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid CourseId { get; set; }
    public Guid VersionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public interface ICourseRepository
{
    Task<Course> Create(Guid owner, string draft, CancellationToken ct);
    Task<Course?> Owned(Guid id, Guid owner, CancellationToken ct);
    Task<CourseAccessState?> OwnedAccess(Guid id, Guid owner, CancellationToken ct);
    Task<Course?> Save(Guid id, Guid owner, long stamp, string draft, CancellationToken ct);
    Task<CourseVersion?> Publish(Guid id, Guid owner, long stamp, string snapshot, CancellationToken ct);
    Task<CourseEnrollment?> Enroll(Guid id, Guid user, CancellationToken ct);
    Task<CourseVersion?> ForLearner(Guid id, Guid user, CancellationToken ct);
    Task<CourseVersion[]> History(Guid id, Guid owner, CancellationToken ct);
}

public sealed class EfCourseRepository(AdamDbContext db) : ICourseRepository
{
    private Task Lock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT pg_advisory_xact_lock(hashtextextended({"course-v2:" + id}, 0))", ct);

    public async Task<Course> Create(Guid owner, string draft, CancellationToken ct)
    {
        var course = new Course { OwnerId = owner, DraftJson = draft };
        db.Courses.Add(course);
        await db.SaveChangesAsync(ct);
        return course;
    }

    public Task<Course?> Owned(Guid id, Guid owner, CancellationToken ct) =>
        db.Courses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner, ct);

    public Task<CourseAccessState?> OwnedAccess(Guid id, Guid owner, CancellationToken ct) =>
        db.Courses.Where(x => x.Id == id && x.OwnerId == owner)
            .Select(x => new CourseAccessState(x.Archived, x.BlockReason)).SingleOrDefaultAsync(ct);

    public Task<CourseVersion[]> History(Guid id, Guid owner, CancellationToken ct) =>
        db.CourseVersions.AsNoTracking().Where(v => v.CourseId == id && db.Courses.Any(c => c.Id == id && c.OwnerId == owner))
            .OrderByDescending(v => v.Number).ToArrayAsync(ct);

    public async Task<Course?> Save(Guid id, Guid owner, long stamp, string draft, CancellationToken ct)
    {
        var changed = await db.Courses.Where(x => x.Id == id && x.OwnerId == owner && x.DraftStamp == stamp)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DraftJson, draft)
                .SetProperty(x => x.DraftStamp, x => x.DraftStamp + 1), ct);
        return changed == 1 ? await Owned(id, owner, ct) : null;
    }

    public async Task<CourseVersion?> Publish(Guid id, Guid owner, long stamp, string snapshot, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(id, ct);
        var course = await Owned(id, owner, ct);
        if (course is null || course.DraftStamp != stamp || course.Archived || course.BlockReason != null) return null;
        var existing = await db.CourseVersions.AsNoTracking().SingleOrDefaultAsync(
            x => x.CourseId == id && x.SourceDraftStamp == stamp, ct);
        if (existing is not null) return existing;
        var number = (await db.CourseVersions.Where(x => x.CourseId == id).MaxAsync(x => (int?)x.Number, ct) ?? 0) + 1;
        var version = new CourseVersion { CourseId = id, Number = number, SourceDraftStamp = stamp, SnapshotJson = snapshot };
        db.CourseVersions.Add(version);
        await db.SaveChangesAsync(ct);
        // A concurrent save must not publish data validated against an older draft.
        var changed = await db.Courses.Where(x => x.Id == id && x.OwnerId == owner && x.DraftStamp == stamp && !x.Archived && x.BlockReason == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.PublishedVersionId, version.Id), ct);
        if (changed != 1) return null;
        await tx.CommitAsync(ct);
        return version;
    }

    public async Task<CourseEnrollment?> Enroll(Guid id, Guid user, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(id, ct);
        var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.BlockReason == null, ct);
        if (course is null) return null;
        var existing = await db.CourseEnrollments.AsNoTracking().SingleOrDefaultAsync(x => x.CourseId == id && x.UserId == user, ct);
        if (existing is not null) return existing;
        if (course.Archived || course.PublishedVersionId is not Guid versionId) return null;
        var enrollment = new CourseEnrollment { CourseId = id, UserId = user, VersionId = versionId };
        db.CourseEnrollments.Add(enrollment);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return enrollment;
    }

    public async Task<CourseVersion?> ForLearner(Guid id, Guid user, CancellationToken ct)
    {
        var enrollment = await db.CourseEnrollments.AsNoTracking().SingleOrDefaultAsync(x => x.CourseId == id && x.UserId == user, ct);
        return enrollment is null ? null : await db.CourseVersions.AsNoTracking().SingleOrDefaultAsync(
            x => x.Id == enrollment.VersionId && x.CourseId == id, ct);
    }
}
