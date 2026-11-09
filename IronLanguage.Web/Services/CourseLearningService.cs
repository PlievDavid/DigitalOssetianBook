using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed class CourseVisit(CourseVersion version)
{
    public CourseVersion Version { get; } = version;
    public HashSet<Guid> Completed { get; } = [];
    public Dictionary<Guid, Guid> Active { get; } = [];
}
public sealed record GuestCourseSession(CourseLessonSession Session, CourseVersion Version, bool Preview, Guid? PreviewUserId);

public sealed class CourseLearningService(ICourseRepository courses, ICourseLearningRepository repository,
    IProgressRepository progress, LearningService learning, GuestLearningStore guests)
{
    public static CourseDraft Read(CourseVersion version) => JsonSerializer.Deserialize<CourseDraft>(version.SnapshotJson, CourseAuthoringService.JsonOptions)!;
    private static CourseDraftLesson? Lesson(CourseVersion version, Guid id) => Read(version).Modules.SelectMany(x => x.Lessons).SingleOrDefault(x => x.Id == id);
    private static Guid?[] Attempts(CourseLessonSession session) => JsonSerializer.Deserialize<Guid?[]>(session.AttemptIdsJson)!;

    public async Task<CourseVersion?> Version(Guid course, Guid? user, Guid owner, CancellationToken ct) => user is null
        ? guests.Find<CourseVisit>(owner, course)?.Value.Version ?? await repository.Version(course, null, ct)
        : await repository.Version(course, user, ct);

    public async Task<HashSet<Guid>> Completed(Guid course, Guid version, Guid? user, Guid owner, CancellationToken ct)
    {
        if (user is Guid uid) return (await repository.Sessions(uid, course, ct)).Where(x => x.VersionId == version && x.CompletedAt != null).Select(x => x.LessonId).ToHashSet();
        var visit = guests.Find<CourseVisit>(owner, course);
        if (visit is null) return [];
        await visit.Gate.WaitAsync(ct);
        try { return visit.Value.Completed.ToHashSet(); } finally { visit.Gate.Release(); }
    }

    public async Task<CourseLessonSession[]> Active(Guid course, Guid version, Guid? user, Guid owner, CancellationToken ct)
    {
        if (user is Guid uid) return (await repository.Sessions(uid, course, ct)).Where(s => s.VersionId == version && s.CompletedAt is null).ToArray();
        var visit = guests.Find<CourseVisit>(owner, course);
        if (visit is null || visit.Value.Version.Id != version) return [];
        await visit.Gate.WaitAsync(ct);
        try { return visit.Value.Active.Values.Select(id => guests.Find<GuestCourseSession>(owner, id)?.Value.Session)
            .OfType<CourseLessonSession>().Where(s => s.CompletedAt is null).OrderByDescending(s => s.StartedAt).ToArray(); }
        finally { visit.Gate.Release(); }
    }

    public async Task<CourseLessonSession?> Start(Guid course, Guid lessonId, Guid? user, Guid owner, CancellationToken ct, CourseVersion? preview = null)
    {
        if (preview is null && user is Guid uid && await courses.Enroll(course, uid, ct) is null) return null;
        if (preview is null && user is null && await repository.Version(course, null, ct) is null) return null;
        var version = preview ?? await Version(course, user, owner, ct);
        if (version is null || Lesson(version, lessonId) is not { } lesson) return null;
        var completed = preview is null ? await Completed(course, version.Id, user, owner, ct) : [];
        if (preview is null && Read(version).Sequential)
        {
            var previous = Read(version).Modules.SelectMany(x => x.Lessons).TakeWhile(x => x.Id != lessonId);
            if (previous.Any(x => !completed.Contains(x.Id))) throw new ArgumentException("Сначала завершите предыдущий урок.");
        }
        var session = new CourseLessonSession { UserId = preview is null ? user ?? Guid.Empty : Guid.Empty, CourseId = course, VersionId = version.Id, LessonId = lessonId };
        var attempts = new List<ExerciseAttempt>();
        var ids = new Guid?[lesson.Blocks.Length];
        for (var i = 0; i < lesson.Blocks.Length; i++)
        {
            var block = lesson.Blocks[i];
            if (block.Kind == "theory") continue;
            if (block.PublishedExercise is not { } exercise || exercise.Kind is not ("translation" or "listening")) throw new ArgumentException("Упражнение недоступно в этой версии курса.");
            var attempt = exercise.Kind == "listening" ? ListeningService.CreateSnapshot(exercise, session.UserId) ?? throw new ArgumentException("Некорректное аудирование.") : LearningService.CreateSnapshot(exercise, session.UserId);
            if (exercise.Kind == "listening") attempt.TokensJson = attempt.OptionsJson;
            attempts.Add(attempt); ids[i] = attempt.Id;
        }
        session.AttemptIdsJson = JsonSerializer.Serialize(ids);
        if (user is not null && preview is null) return await repository.Start(session, attempts, ct);
        if (preview is null && guests.Find<CourseVisit>(owner, course) is null) guests.Add(owner, course, new CourseVisit(version));
        var visit = preview is null ? guests.Find<CourseVisit>(owner, course) : null;
        if (visit is not null) await visit.Gate.WaitAsync(ct);
        try
        {
            if (visit is not null && visit.Value.Active.TryGetValue(lessonId, out var active) && guests.Find<GuestCourseSession>(owner, active) is { Value.Session.CompletedAt: null } existing)
                return existing.Value.Session;
            guests.AddGroup(owner, group => { group.Add(session.Id, new GuestCourseSession(session, version, preview is not null, preview is null ? null : user)); foreach (var attempt in attempts) group.Add(attempt.Id, attempt); });
            if (visit is not null) visit.Value.Active[lessonId] = session.Id;
            return session;
        }
        finally { visit?.Gate.Release(); }
    }

    private async Task<(CourseLessonSession Session, CourseVersion Version, bool Temporary)?> Find(Guid id, Guid? user, Guid owner, CancellationToken ct)
    {
        if (guests.Find<GuestCourseSession>(owner, id) is { } temporary)
        {
            if (temporary.Value.Preview && (user is null || user != temporary.Value.PreviewUserId)) return null;
            if (!temporary.Value.Preview && await repository.Version(temporary.Value.Session.CourseId, null, ct) is null) return null;
            return (temporary.Value.Session, temporary.Value.Version, true);
        }
        if (user is not Guid uid || await repository.Session(uid, id, ct) is not { } session) return null;
        var version = await courses.ForLearner(session.CourseId, uid, ct);
        return version is null || version.Id != session.VersionId ? null : (session, version, false);
    }

    public async Task<object?> State(Guid id, Guid? user, Guid owner, CancellationToken ct, Guid? blockId = null)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var (session, version, temporary) = found;
        var draft = Read(version);
        var lesson = draft.Modules.SelectMany(m => m.Lessons).Single(l => l.Id == session.LessonId);
        var viewStep = blockId is Guid bid ? Array.FindIndex(lesson.Blocks, b => b.Id == bid) : session.Step;
        if (viewStep < 0 || viewStep > lesson.Blocks.Length) throw new ArgumentException("Сначала завершите предыдущие шаги.");
        object? blockData = null;
        if (viewStep < lesson.Blocks.Length)
        {
            var block = lesson.Blocks[viewStep];
            ExerciseCard? card = null; object? result = null;
            if (Attempts(session)[viewStep] is Guid aid)
            {
                var attempt = temporary ? guests.Find<ExerciseAttempt>(owner, aid)?.Value : await progress.Attempt(user!.Value, aid, ct);
                if (attempt is null) throw new ArgumentException("Занятие истекло. Откройте урок заново.");
                card = await learning.SnapshotCard(block.Kind, attempt, ct);
                if (attempt.CompletedAt is not null) result = new { correct = attempt.Correct, expectedAnswer = attempt.ExpectedAnswer, explanation = attempt.Explanation };
            }
            blockData = new { block.Id, block.Kind, block.Title, block.Text, block.RichText, card, result };
        }
        var preview = temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview;
        var done = preview ? new HashSet<Guid>() : await Completed(session.CourseId, version.Id, user, owner, ct);
        var unlocked = true;
        var lessons = draft.Modules.SelectMany(m => m.Lessons.Select(l => {
            var available = !draft.Sequential || unlocked;
            if (!done.Contains(l.Id)) unlocked = false;
            return new { l.Id, l.Title, module = m.Title, completed = done.Contains(l.Id), available };
        })).ToArray();
        return new { draft.Theme, session.Id, session.CourseId, session.LessonId, lesson.Title, session.Step, count = lesson.Blocks.Length,
            viewStep, steps = lesson.Blocks.Select((b, i) => new { b.Id, b.Title, completed = i < session.Step || session.CompletedSteps.Contains(i), available = true }).ToArray(), lessons,
            completed = session.CompletedAt is not null, block = blockData, preview };
    }

    public async Task<AnswerResult?> Answer(Guid id, Guid blockId, int[] indices, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, b => b.Id == blockId);
        if (index < 0 || Attempts(found.Session)[index] is not Guid attemptId) return null;
        if (lesson.Blocks[index].Kind == "listening" && indices.Length != 1) throw new ArgumentException("Выберите один ответ.");
        return found.Temporary ? await learning.AnswerGuest(owner, attemptId, indices, ct) : await learning.Answer(user!.Value, attemptId, indices, ct);
    }

    public async Task<bool> Advance(Guid id, Guid blockId, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return false;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, x => x.Id == blockId);
        if (index < 0) return false;
        var aid = Attempts(found.Session)[index];
        if (!found.Temporary) return await repository.Advance(user!.Value, id, index, lesson.Blocks.Length, aid, ct);
        var entry = guests.Find<GuestCourseSession>(owner, id);
        if (entry is null) return false;
        await entry.Gate.WaitAsync(ct);
        try
        {
            if (entry.Value.Session.Step > index) return true;
            if (aid is Guid attemptId && guests.Find<ExerciseAttempt>(owner, attemptId)?.Value.CompletedAt is null) return false;
                        var completed = entry.Value.Session.CompletedSteps.Concat(Enumerable.Range(0, entry.Value.Session.Step)).Append(index).Distinct().ToArray();
            entry.Value.Session.CompletedSteps = completed;
            while (completed.Contains(entry.Value.Session.Step) && entry.Value.Session.Step < lesson.Blocks.Length) entry.Value.Session.Step++;
            if (entry.Value.Session.Step == lesson.Blocks.Length)
            {
                entry.Value.Session.CompletedAt = DateTimeOffset.UtcNow;
                if (!entry.Value.Preview && guests.Find<CourseVisit>(owner, entry.Value.Session.CourseId) is { } visit)
                {
                    await visit.Gate.WaitAsync(ct);
                    try { visit.Value.Completed.Add(entry.Value.Session.LessonId); } finally { visit.Gate.Release(); }
                }
            }
            return true;
        }
        finally { entry.Gate.Release(); }
    }
}
