using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class LibraryLesson
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OwnerId { get; set; }
    public Guid SourceCourseId { get; set; }
    public Guid SourceLessonId { get; set; }
    public long SourceStamp { get; set; }
    public string LessonJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public interface ILessonLibraryRepository
{
    Task<LibraryLesson[]> Owned(Guid owner, CancellationToken ct);
    Task<LibraryLesson?> Owned(Guid owner, Guid id, CancellationToken ct);
    Task<LibraryLesson> Save(LibraryLesson lesson, CancellationToken ct);
}

public sealed class EfLessonLibraryRepository(AdamDbContext db) : ILessonLibraryRepository
{
    public Task<LibraryLesson[]> Owned(Guid owner, CancellationToken ct) => db.LibraryLessons.AsNoTracking()
        .Where(x => x.OwnerId == owner).OrderByDescending(x => x.CreatedAt).ToArrayAsync(ct);

    public Task<LibraryLesson?> Owned(Guid owner, Guid id, CancellationToken ct) =>
        db.LibraryLessons.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner && x.Id == id, ct);

    public async Task<LibraryLesson> Save(LibraryLesson lesson, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"lesson-library:" + lesson.OwnerId}, 0))", ct);
        var existing = await db.LibraryLessons.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == lesson.OwnerId &&
            x.SourceCourseId == lesson.SourceCourseId && x.SourceLessonId == lesson.SourceLessonId && x.SourceStamp == lesson.SourceStamp, ct);
        if (existing is not null) return existing;
        db.LibraryLessons.Add(lesson);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return lesson;
    }
}
