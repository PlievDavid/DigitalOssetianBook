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
    IProgressRepository progress, LearningService learning, GuestLearningStore guests, ICourseMaterialRepository? materials = null)
{
    public static CourseDraft Read(CourseVersion version) => JsonSerializer.Deserialize<CourseDraft>(version.SnapshotJson, CourseAuthoringService.JsonOptions)!;
    private static CourseDraftLesson? Lesson(CourseVersion version, Guid id) => Read(version).Modules.SelectMany(x => x.Lessons).SingleOrDefault(x => x.Id == id);
    private static Guid?[] Attempts(CourseLessonSession session) => JsonSerializer.Deserialize<Guid?[]>(session.AttemptIdsJson)!;
    private async Task<bool> Blocked(CourseDraftBlock block, CancellationToken ct) =>
        block.MaterialId is Guid id && materials is not null && (await materials.Blocked([id], ct)).Contains(id);

    public Task<CourseVersion?> Version(Guid course, Guid? user, Guid owner, CancellationToken ct) => repository.Version(course, user, ct);

    private async Task<List<CourseLessonSession>> History(Guid course, Guid? user, Guid owner, CancellationToken ct)
    {
        if (user is Guid uid) return await repository.Sessions(uid, course, ct);
        var visit = guests.Find<CourseVisit>(owner, course);
        if (visit is null) return [];
        await visit.Gate.WaitAsync(ct);
        try { return visit.Value.Active.Values.Select(id => guests.Find<GuestCourseSession>(owner, id)?.Value.Session).OfType<CourseLessonSession>().ToList(); }
        finally { visit.Gate.Release(); }
    }
    internal static string Fingerprint(CourseDraftBlock b) => JsonSerializer.Serialize(new
    {
        b.Kind, b.Text, b.RichText, b.MaterialId, b.TheoryMedia,
        exercise = b.PublishedExercise is not { } e ? null : new { e.RussianPrompt, e.OssetianAnswer, e.TokensJson,
            e.AlternativesJson, e.DistractorsJson, e.OptionsJson, e.CorrectOption, e.Transcript, e.WordIdsJson, e.Explanation, e.AudioPath },
        activity = b.PublishedActivity?.PayloadJson
    }, CourseAuthoringService.JsonOptions);
    private async Task<Dictionary<Guid, (bool Done, Guid? Attempt)>> Credits(Guid course, CourseVersion version, Guid? user, Guid owner, CancellationToken ct) =>
        await Credits(version, await History(course, user, owner, ct), ct);

    private async Task<Dictionary<Guid, (bool Done, Guid? Attempt)>> Credits(CourseVersion version, List<CourseLessonSession> sessions, CancellationToken ct)
    {
        var snapshots = await repository.Snapshots(sessions.Select(s => s.VersionId).Distinct().ToArray(), ct);
        return CalculateCredits(version, sessions, snapshots.ToDictionary(x => x.Id));
    }

    internal static Dictionary<Guid, (bool Done, Guid? Attempt)> CalculateCredits(CourseVersion version,
        IEnumerable<CourseLessonSession> sessions, IReadOnlyDictionary<Guid, CourseVersion> snapshots)
    {
        var current = Read(version).Modules.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks).ToDictionary(b => b.Id);
        var result = new Dictionary<Guid, (bool Done, Guid? Attempt)>();
        foreach (var session in sessions)
        {
            if (!snapshots.TryGetValue(session.VersionId, out var old) || Lesson(old, session.LessonId) is not { } lesson) continue;
            var attempts = Attempts(session);
            for (var i = 0; i < lesson.Blocks.Length; i++)
            {
                var block = lesson.Blocks[i];
                if (!current.TryGetValue(block.Id, out var target) || Fingerprint(block) != Fingerprint(target)) continue;
                var done = i < session.Step || session.CompletedSteps.Contains(i);
                if (!result.TryGetValue(block.Id, out var existing) || !existing.Done && done)
                    result[block.Id] = (done, i < attempts.Length ? attempts[i] : null);
            }
        }
        return result;
    }
    public async Task<Dictionary<Guid, CourseCounts>> Counts(CourseVersion[] versions, Guid? user, Guid owner, CancellationToken ct)
    {
        var sessions = user is Guid uid
            ? await repository.History(versions.Select(v => v.CourseId).ToArray(), uid, ct)
            : (await Task.WhenAll(versions.Select(v => History(v.CourseId, null, owner, ct)))).SelectMany(x => x).ToArray();
        var snapshots = (await repository.Snapshots(sessions.Select(x => x.VersionId).Distinct().ToArray(), ct)).ToDictionary(x => x.Id);
        var byCourse = sessions.ToLookup(s => s.CourseId);
        return versions.ToDictionary(v => v.CourseId, v => Count(v, CalculateCredits(v, byCourse[v.CourseId], snapshots)));
    }

    public sealed record CourseCounts(int CompletedBlocks, int TotalBlocks, int Percent, int CompletedLessons);

    internal static CourseCounts Count(CourseVersion version, Dictionary<Guid, (bool Done, Guid? Attempt)> credits)
    {
        var lessons = Read(version).Modules.SelectMany(m => m.Lessons).ToArray();
        var complete = credits.Count(x => x.Value.Done);
        var total = lessons.Sum(l => l.Blocks.Length);
        return new(complete, total, total == 0 ? 0 : complete * 100 / total,
            lessons.Count(l => l.Blocks.All(b => credits.TryGetValue(b.Id, out var credit) && credit.Done)));
    }

    internal static DateTimeOffset? FirstCompletion(IEnumerable<CourseLessonSession> sessions, IReadOnlyDictionary<Guid, CourseVersion> snapshots)
    {
        DateTimeOffset? first = null;
        foreach (var version in snapshots.Values.OrderBy(v => v.Number))
        {
            var prior = sessions.Where(s => snapshots.TryGetValue(s.VersionId, out var v) && v.Number <= version.Number).ToArray();
            if (Count(version, CalculateCredits(version, prior, snapshots)).Percent != 100) continue;
            var date = prior.Select(s => s.CompletedAt).Max();
            if (date is not null && (first is null || date < first)) first = date;
        }
        return first;
    }

    public async Task<DateTimeOffset?> FirstCompletion(Guid course, Guid? user, Guid owner, CancellationToken ct)
    {
        var sessions = await History(course, user, owner, ct);
        var versions = await repository.Snapshots(sessions.Select(s => s.VersionId).Distinct().ToArray(), ct);
        return FirstCompletion(sessions, versions.ToDictionary(v => v.Id));
    }
    public async Task<(int Completed, int Total)> BlockProgress(Guid course, CourseVersion version, Guid? user, Guid owner, CancellationToken ct)
    {
        var credits = await Credits(course, version, user, owner, ct);
        return (credits.Count(x => x.Value.Done), Read(version).Modules.Sum(m => m.Lessons.Sum(l => l.Blocks.Length)));
    }
    public async Task<HashSet<Guid>> Completed(Guid course, Guid version, Guid? user, Guid owner, CancellationToken ct)
    {
        var snapshot = await repository.Snapshot(version, ct);
        if (snapshot is null) return [];
        var credits = await Credits(course, snapshot, user, owner, ct);
        return Read(snapshot).Modules.SelectMany(m => m.Lessons).Where(l => l.Blocks.All(b => credits.TryGetValue(b.Id, out var c) && c.Done)).Select(l => l.Id).ToHashSet();
    }

    public async Task<CourseLessonSession[]> Opened(Guid course, Guid? user, Guid owner, CancellationToken ct) =>
        (await History(course, user, owner, ct)).OrderByDescending(s => s.StartedAt).DistinctBy(s => s.LessonId).ToArray();

    public async Task<CourseLessonSession?> Start(Guid course, Guid lessonId, Guid? user, Guid owner, CancellationToken ct, CourseVersion? preview = null)
    {
        if (preview is null && await repository.BlockReason(course, ct) is { } reason)
            throw new ArgumentException("Курс недоступен. " + reason);
        if (preview is null && user is null && await repository.Version(course, null, ct) is null) return null;
        var version = preview ?? await Version(course, user, owner, ct);
        if (version is null || Lesson(version, lessonId) is not { } lesson) return null;
        var completed = preview is null ? await Completed(course, version.Id, user, owner, ct) : [];
        if (preview is null && Read(version).Sequential && !(await History(course, user, owner, ct)).Any(s => s.LessonId == lessonId))
        {
            var previous = Read(version).Modules.SelectMany(x => x.Lessons).TakeWhile(x => x.Id != lessonId);
            if (previous.Any(x => !completed.Contains(x.Id))) throw new ArgumentException("Сначала завершите предыдущий урок.");
        }
        if (preview is null && user is Guid uid && await courses.Enroll(course, uid, ct) is null) return null;
        var session = new CourseLessonSession { UserId = preview is null ? user ?? Guid.Empty : Guid.Empty, CourseId = course, VersionId = version.Id, LessonId = lessonId };
        var credits = preview is null ? await Credits(course, version, user, owner, ct) : [];
        var attempts = new List<ExerciseAttempt>();
        var practices = new List<CoursePracticeRun>();
        var ids = new Guid?[lesson.Blocks.Length];
        for (var i = 0; i < lesson.Blocks.Length; i++)
        {
            var block = lesson.Blocks[i];
            if (block.Kind == "theory") continue;
            if (credits.TryGetValue(block.Id, out var credit) && credit.Attempt is Guid existingAttempt) { ids[i] = existingAttempt; continue; }
            if (block.PublishedActivity is { } activity)
            {
                var practice = CoursePractice.Create(activity, session.UserId);
                practices.Add(practice);
                ids[i] = practice.Id;
                continue;
            }
            if (block.PublishedExercise is not { } exercise || exercise.Kind is not ("translation" or "listening" or "audio")) throw new ArgumentException("Упражнение недоступно в этой версии курса.");
            var attempt = CreateAttempt(exercise, session.UserId);
            attempt.LessonRunId = session.Id;
            attempts.Add(attempt); ids[i] = attempt.Id;
        }
        session.AttemptIdsJson = JsonSerializer.Serialize(ids);
        session.CompletedSteps = lesson.Blocks.Select((b, i) => (b, i)).Where(x => credits.TryGetValue(x.b.Id, out var c) && c.Done).Select(x => x.i).ToArray();
        while (session.CompletedSteps.Contains(session.Step)) session.Step++;
        if (session.Step == lesson.Blocks.Length) session.CompletedAt = DateTimeOffset.UtcNow;
        if (user is not null && preview is null) return await repository.Start(session, attempts, ct, practices);
        if (preview is null && guests.Find<CourseVisit>(owner, course) is null) guests.Add(owner, course, new CourseVisit(version));
        var visit = preview is null ? guests.Find<CourseVisit>(owner, course) : null;
        if (visit is not null) await visit.Gate.WaitAsync(ct);
        try
        {
            if (visit is not null && visit.Value.Active.TryGetValue(lessonId, out var active) && guests.Find<GuestCourseSession>(owner, active) is { Value.Session.CompletedAt: null } existing)
                if (existing.Value.Session.VersionId == version.Id) return existing.Value.Session;
            guests.AddGroup(owner, group =>
            {
                group.Add(session.Id, new GuestCourseSession(session, version, preview is not null, preview is null ? null : user));
                foreach (var attempt in attempts) group.Add(attempt.Id, attempt);
                foreach (var practice in practices) group.Add(practice.Id, practice);
            });
            if (visit is not null) visit.Value.Active[lessonId] = session.Id;
            return session;
        }
        finally { visit?.Gate.Release(); }
    }

    private static ExerciseAttempt CreateAttempt(Exercise exercise, Guid user)
    {
        var attempt = exercise.Kind == "listening"
            ? ListeningService.CreateSnapshot(exercise, user) ?? throw new ArgumentException("Некорректное аудирование.")
            : LearningService.CreateSnapshot(exercise, user);
        if (exercise.Kind == "listening") attempt.TokensJson = attempt.OptionsJson;
        if (exercise.Kind == "audio")
        {
            var distractors = JsonSerializer.Deserialize<string[][]>(exercise.DistractorsJson) ?? [];
            string[] words = [.. LearningService.ParseTokens(attempt.TokensJson), .. distractors.SelectMany(x => x)];
            Random.Shared.Shuffle(words);
            attempt.TokensJson = JsonSerializer.Serialize(words);
        }
        return attempt;
    }

    private async Task<(CourseLessonSession Session, CourseVersion Version, bool Temporary)?> Find(Guid id, Guid? user, Guid owner, CancellationToken ct)
    {
        if (guests.Find<GuestCourseSession>(owner, id) is { } temporary)
        {
            if (temporary.Value.Preview && (user is not Guid editor || editor != temporary.Value.PreviewUserId ||
                await courses.OwnedAccess(temporary.Value.Session.CourseId, editor, ct) is null)) return null;
            if (!temporary.Value.Preview && await repository.Version(temporary.Value.Session.CourseId, null, ct) is null &&
                await repository.BlockReason(temporary.Value.Session.CourseId, ct) is null) return null;
            return (temporary.Value.Session, temporary.Value.Version, true);
        }
        if (user is not Guid uid || await repository.Session(uid, id, ct) is not { } session) return null;
        var version = await repository.Snapshot(session.VersionId, ct);
        return version is null || version.Id != session.VersionId ? null : (session, version, false);
    }

    public async Task<object?> State(Guid id, Guid? user, Guid owner, CancellationToken ct, Guid? blockId = null, bool upgrade = true)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var (session, version, temporary) = found;
        var isPreview = temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview;
        if (!isPreview && await repository.BlockReason(session.CourseId, ct) is { } reason)
            throw new ArgumentException("Курс недоступен. " + reason);
        var latest = isPreview ? version : await Version(session.CourseId, user, owner, ct);
        if (latest is not null && latest.Id != version.Id)
        {
            if (!upgrade) return new { updateRequired = true };
            var targetLesson = Lesson(latest, session.LessonId);
            if (targetLesson is null)
            {
                var oldOrder = Read(version).Modules.SelectMany(m => m.Lessons).Select(l => l.Id).ToArray();
                var after = oldOrder.Skip(Array.IndexOf(oldOrder, session.LessonId) + 1).ToHashSet();
                var latestDraft = Read(latest);
                var completed = await Completed(session.CourseId, latest.Id, user, owner, ct);
                foreach (var candidate in latestDraft.Modules.SelectMany(m => m.Lessons))
                {
                    if (after.Contains(candidate.Id) && !completed.Contains(candidate.Id))
                    {
                        targetLesson = candidate;
                        break;
                    }
                    if (latestDraft.Sequential && !completed.Contains(candidate.Id)) break;
                }
            }
            if (targetLesson is not null && await Start(session.CourseId, targetLesson.Id, user, owner, ct) is { } updated)
                return await State(updated.Id, user, owner, ct, targetLesson.Blocks.Any(b => b.Id == blockId) ? blockId : null);
            return new { courseRedirect = session.CourseId };
        }
        var draft = Read(version);
        var lesson = draft.Modules.SelectMany(m => m.Lessons).Single(l => l.Id == session.LessonId);
        var viewStep = blockId is Guid bid ? Array.FindIndex(lesson.Blocks, b => b.Id == bid) : session.Step;
        if (viewStep < 0 || viewStep > lesson.Blocks.Length) throw new ArgumentException("Сначала завершите предыдущие шаги.");
        object? blockData = null;
        if (viewStep < lesson.Blocks.Length)
        {
            var block = lesson.Blocks[viewStep];
            ExerciseCard? card = null; object? result = null; object? practice = null;
            var unavailable = await Blocked(block, ct);
            if (!unavailable && Attempts(session)[viewStep] is Guid aid)
            {
                if (CoursePractice.Supports(block.Kind))
                {
                    var run = temporary ? guests.Find<CoursePracticeRun>(owner, aid)?.Value : await repository.Practice(user!.Value, aid, ct);
                    if (run is null) throw new ArgumentException("Занятие истекло. Откройте урок заново.");
                    practice = CoursePractice.View(block.Kind, run, $"/api/v1/course-sessions/{id}/media/{block.Id}");
                }
                else
                {
                    var attempt = temporary ? guests.Find<ExerciseAttempt>(owner, aid)?.Value : await progress.Attempt(user!.Value, aid, ct);
                    if (attempt is null) throw new ArgumentException("Занятие истекло. Откройте урок заново.");
                    card = await learning.SnapshotCard(block.Kind == "audio" ? "translation" : block.Kind, attempt, ct);
                    if (card.AudioPath is not null) card = card with { AudioPath = $"/api/v1/course-sessions/{id}/media/{block.Id}" };
                    if (attempt.CompletedAt is not null) result = new { correct = attempt.Correct, expectedAnswer = attempt.ExpectedAnswer, explanation = attempt.Explanation };
                }
            }
            var theoryMedia = block.TheoryMedia is { } attachment ? new
            {
                video = CourseTheoryMediaStore.IsVideo(attachment.File), attachment.Alt, attachment.Caption,
                url = $"/api/v1/course-sessions/{id}/theory-media/{block.Id}"
            } : null;
            blockData = new { block.Id, block.Kind, block.Title, block.Text, block.RichText, theoryMedia,
                attemptId = Attempts(session)[viewStep], card, result, practice, unavailable };
        }
        var history = isPreview ? [] : await History(session.CourseId, user, owner, ct);
        var credits = isPreview ? [] : await Credits(version, history, ct);
        var opened = history.Select(x => x.LessonId).ToHashSet();
        var unlocked = true;
        var lessons = draft.Modules.SelectMany(m => m.Lessons.Select(l => {
            var available = !draft.Sequential || unlocked || opened.Contains(l.Id);
            var completedBlocks = l.Blocks.Count(b => credits.TryGetValue(b.Id, out var credit) && credit.Done);
            var totalBlocks = l.Blocks.Length;
            var completed = completedBlocks == totalBlocks;
            if (!completed) unlocked = false;
            return new { l.Id, l.Title, moduleId = m.Id, module = m.Title, completed, available, completedBlocks, totalBlocks };
        })).ToArray();
        var courseProgress = new { completedBlocks = lessons.Sum(l => l.completedBlocks), totalBlocks = lessons.Sum(l => l.totalBlocks) };
        return new { draft.Theme, session.Id, session.CourseId, session.LessonId, lesson.Title, session.Step, count = lesson.Blocks.Length,
            viewStep, steps = lesson.Blocks.Select((b, i) => new { b.Id, b.Title, completed = i < session.Step || session.CompletedSteps.Contains(i), available = true }).ToArray(), lessons,
            courseProgress, completed = session.CompletedAt is not null, block = blockData, preview = isPreview };
    }

    public async Task<AnswerResult?> Answer(Guid id, Guid blockId, int[] indices, Guid? user, Guid owner, CancellationToken ct, Guid? expectedAttempt = null)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, b => b.Id == blockId);
        if (index < 0 || Attempts(found.Session)[index] is not Guid attemptId) return null;
        if (!await CanUse(found.Session.CourseId, lesson.Blocks[index], found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview, ct)) return null;
        if (expectedAttempt is Guid expected && expected != attemptId) throw new ArgumentException("Попытка уже обновлена. Откройте блок заново.");
        if (lesson.Blocks[index].Kind == "listening" && indices.Length != 1) throw new ArgumentException("Выберите один ответ.");
        var answer = found.Temporary
            ? await learning.AnswerGuest(owner, attemptId, indices, ct, withinLesson: true)
            : await learning.Answer(user!.Value, attemptId, indices, ct, withinLesson: true);
        if (!found.Temporary && answer is { AlreadySubmitted: false }) await repository.Record(found.Session, blockId, attemptId.ToString("N"), answer.Correct, ct);
        if (answer?.Correct == true) await Advance(id, blockId, user, owner, ct);
        return answer;
    }

    public async Task<bool> Retry(Guid id, Guid blockId, Guid expectedAttempt, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return false;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, b => b.Id == blockId);
        if (index < 0 || lesson.Blocks[index].PublishedExercise is not { } exercise) return false;
        if (!await CanUse(found.Session.CourseId, lesson.Blocks[index], found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview, ct)) return false;
        var replacement = CreateAttempt(exercise, found.Session.UserId);
        replacement.LessonRunId = found.Session.Id;
        if (!found.Temporary) return await repository.Retry(found.Session, index, expectedAttempt, replacement, ct);
        var entry = guests.Find<GuestCourseSession>(owner, id);
        if (entry is null) return false;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var ids = Attempts(entry.Value.Session);
            if (ids[index] != expectedAttempt) return true;
            if (guests.Find<ExerciseAttempt>(owner, expectedAttempt)?.Value is not { CompletedAt: not null, Correct: false }) return false;
            guests.Add(owner, replacement.Id, replacement);
            ids[index] = replacement.Id;
            entry.Value.Session.AttemptIdsJson = JsonSerializer.Serialize(ids);
            return true;
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<object?> PracticeAnswer(Guid id, CoursePracticeInput input, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, b => b.Id == input.BlockId);
        if (index < 0 || !CoursePractice.Supports(lesson.Blocks[index].Kind) || Attempts(found.Session)[index] is not Guid runId) return null;
        if (!await CanUse(found.Session.CourseId, lesson.Blocks[index], found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview, ct)) return null;
        var kind = lesson.Blocks[index].Kind;
        if (!found.Temporary)
        {
            if (await repository.Practice(user!.Value, runId, ct) is not { } run) return null;
            if (run.Complete || run.Revision != input.Revision) return new { stale = true };
            var (reply, correct) = await CoursePractice.Answer(kind, run, input);
            if (!await repository.SavePractice(run, input.Revision, ct)) return new { stale = true };
            await repository.Record(found.Session, input.BlockId, $"{runId:N}:{input.Revision}", correct, ct);
            if (run.Complete) await Advance(id, input.BlockId, user, owner, ct);
            return reply;
        }
        var entry = guests.Find<CoursePracticeRun>(owner, runId);
        if (entry is null) return null;
        object response;
        bool completed;
        await entry.Gate.WaitAsync(ct);
        try
        {
            if (entry.Value.Complete || entry.Value.Revision != input.Revision) return new { stale = true };
            var (reply, _) = await CoursePractice.Answer(kind, entry.Value, input);
            entry.Value.Revision++;
            response = reply;
            completed = entry.Value.Complete;
        }
        finally { entry.Gate.Release(); }
        if (completed) await Advance(id, input.BlockId, user, owner, ct);
        return response;
    }

    public async Task<bool> Advance(Guid id, Guid blockId, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return false;
        var lesson = Lesson(found.Version, found.Session.LessonId)!;
        var index = Array.FindIndex(lesson.Blocks, x => x.Id == blockId);
        if (index < 0) return false;
        if (!await CanUse(found.Session.CourseId, lesson.Blocks[index], found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview, ct)) return false;
        var aid = Attempts(found.Session)[index];
        if (!found.Temporary)
        {
            var completed = await repository.Advance(user!.Value, id, index, lesson.Blocks.Length, aid, ct);
            if (completed) await repository.Record(found.Session, blockId, "complete", null, ct);
            return completed;
        }
        var entry = guests.Find<GuestCourseSession>(owner, id);
        if (entry is null) return false;
        await entry.Gate.WaitAsync(ct);
        try
        {
            if (entry.Value.Session.Step > index) return true;
            if (aid is Guid attemptId &&
                guests.Find<ExerciseAttempt>(owner, attemptId)?.Value is not { CompletedAt: not null, Correct: true } &&
                guests.Find<CoursePracticeRun>(owner, attemptId)?.Value.Complete != true) return false;
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

    public async Task<bool> ViewBlock(Guid id, Guid blockId, Guid user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { Temporary: false } found) return false;
        var block = Lesson(found.Version, found.Session.LessonId)?.Blocks.FirstOrDefault(b => b.Id == blockId);
        if (block is null || !await CanUse(found.Session.CourseId, block, false, ct)) return false;
        await repository.Record(found.Session, blockId, "open", null, ct);
        return true;
    }

    public async Task<string?> Media(Guid id, Guid blockId, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var block = Lesson(found.Version, found.Session.LessonId)?.Blocks.FirstOrDefault(b => b.Id == blockId);
        if (block is null || !await CanUse(found.Session.CourseId, block, found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview, ct)) return null;
        if (block.PublishedExercise is { } exercise) return exercise.AudioPath;
        if (block.Kind == "picture" && block.PublishedActivity is { } picture)
            return JsonSerializer.Deserialize<PictureMaterial>(picture.PayloadJson, CourseAuthoringService.JsonOptions)?.PicturePath;
        return null;
    }

    public async Task<(Guid Owner, string File)?> TheoryMedia(Guid id, Guid blockId, Guid? user, Guid owner, CancellationToken ct)
    {
        if (await Find(id, user, owner, ct) is not { } found) return null;
        var block = Lesson(found.Version, found.Session.LessonId)?.Blocks.FirstOrDefault(b => b.Id == blockId);
        if (block is not { Kind: "theory", TheoryMedia: { } attachment }) return null;
        var preview = found.Temporary && guests.Find<GuestCourseSession>(owner, id)!.Value.Preview;
        if (!await CanUse(found.Session.CourseId, block, preview, ct)) return null;
        return await courses.Owner(found.Session.CourseId, ct) is Guid author ? (author, attachment.File) : null;
    }

    private async Task<bool> CanUse(Guid course, CourseDraftBlock block, bool preview, CancellationToken ct) =>
        (preview || await repository.BlockReason(course, ct) is null) && !await Blocked(block, ct);
}
