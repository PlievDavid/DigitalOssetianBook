using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed class CourseAnalytics(ICourseRepository courses, ICourseLearningRepository learning)
{
    private sealed record StudentSummary(Guid Id, string Name, DateTimeOffset StartedAt, DateTimeOffset LastActive,
        DateTimeOffset? FinishedAt, CourseLearningService.CourseCounts Counts, string Status);

    public async Task<object?> Report(Guid course, Guid owner, Guid? learner, int days, int page, CancellationToken ct)
    {
        if (await courses.Owned(course, owner, ct) is not { PublishedVersionId: Guid versionId } ||
            await learning.Snapshot(versionId, ct) is not { } version) return null;

        var enrollments = (await learning.Learners(course, ct)).ToDictionary(e => e.Id);
        if (learner is Guid requested && !enrollments.ContainsKey(requested)) return null;
        var cutoff = new DateTimeOffset(DateTimeOffset.UtcNow.UtcDateTime.Date.AddDays(1 - days), TimeSpan.Zero);
        var versionIds = await learning.ReportVersionIds(course, learner, ct);
        var versions = (await learning.Snapshots(versionIds.Append(versionId).Distinct().ToArray(), ct)).ToDictionary(x => x.Id);
        var events = await learning.Activity(course, learner, cutoff, ct);
        var byActivity = events.ToLookup(a => a.UserId);
        var title = CourseLearningService.Read(version).Title;
        var program = CourseLearningService.Read(version).Modules;
        var currentBlocks = program.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks).ToArray();
        var fingerprints = currentBlocks.ToDictionary(b => b.Id, CourseLearningService.Fingerprint);
        var comparableBlocks = versions.Values.ToDictionary(v => v.Id, v => CourseLearningService.Read(v).Modules
            .SelectMany(m => m.Lessons).SelectMany(l => l.Blocks)
            .Where(b => fingerprints.TryGetValue(b.Id, out var fingerprint) && CourseLearningService.Fingerprint(b) == fingerprint)
            .Select(b => b.Id).ToHashSet());
        var comparable = events.Where(a => comparableBlocks.TryGetValue(a.VersionId, out var blocks) && blocks.Contains(a.BlockId)).ToArray();

        StudentSummary Summarize(CourseLearner enrollment, IReadOnlyList<CourseLessonSession> sessions)
        {
            var credits = CourseLearningService.CalculateCredits(version, sessions, versions);
            var counts = CourseLearningService.Count(version, credits);
            var finishedAt = CourseLearningService.FirstCompletion(sessions, versions);
            var lastActive = byActivity[enrollment.Id].Select(a => a.At).Concat(sessions.Select(s => s.CompletedAt ?? s.StartedAt)).Max();
            var startedAt = sessions.Min(s => s.StartedAt);
            return new(enrollment.Id, enrollment.Name, startedAt, lastActive, finishedAt, counts,
                counts.Percent == 100 ? "Завершён" : finishedAt is not null ? "Есть новые блоки" : "В процессе");
        }

        var students = new List<StudentSummary>();
        var sessions = new List<CourseLessonSession>();
        await foreach (var session in learning.ReportHistory(course, learner).WithCancellation(ct))
        {
            if (!enrollments.ContainsKey(session.UserId)) continue;
            if (sessions.Count > 0 && sessions[0].UserId != session.UserId)
            {
                students.Add(Summarize(enrollments[sessions[0].UserId], sessions));
                sessions.Clear();
            }
            sessions.Add(session);
        }

        if (learner is Guid learnerId)
        {
            if (sessions.Count == 0) return null;
            var student = Summarize(enrollments[learnerId], sessions);
            var credits = CourseLearningService.CalculateCredits(version, sessions, versions);
            var ownEvents = comparable.Where(e => e.UserId == learnerId).ToLookup(e => e.BlockId);
            return new { title, student, modules = program.Select(module => new { module.Title,
                lessons = module.Lessons.Select(lesson => new { lesson.Title, blocks = lesson.Blocks.Select(block =>
                {
                    var activity = ownEvents[block.Id];
                    return new { block.Title, completed = credits.TryGetValue(block.Id, out var credit) && credit.Done,
                        attempts = activity.Count(a => a.Correct.HasValue), correct = activity.Count(a => a.Correct == true),
                        firstSeen = activity.Select(a => (DateTimeOffset?)a.At).Min(), lastSeen = activity.Select(a => (DateTimeOffset?)a.At).Max() };
                }) }) }) };
        }

        if (sessions.Count > 0) students.Add(Summarize(enrollments[sessions[0].UserId], sessions));
        var summaries = students.OrderByDescending(s => s.LastActive).ThenBy(s => s.Id).ToArray();
        var period = comparable.Where(a => a.At >= cutoff).ToLookup(a => a.BlockId);
        var firstAnswers = comparable.Where(a => a.Correct.HasValue).GroupBy(a => (a.UserId, a.BlockId))
            .Select(g => g.OrderBy(a => a.At).First()).Where(a => a.At >= cutoff).ToLookup(a => a.BlockId);
        return new
        {
            title, days, started = summaries.Length, finished = summaries.Count(s => s.Counts.Percent == 100),
            averageProgress = summaries.Length == 0 ? 0 : (int)summaries.Average(s => s.Counts.Percent),
            startedInPeriod = summaries.Count(s => s.StartedAt >= cutoff),
            finishedInPeriod = summaries.Count(s => s.FinishedAt >= cutoff),
            students = summaries.Skip((page - 1) * 20).Take(20), hasMore = page * 20 < summaries.Length,
            blocks = currentBlocks.Select(block =>
            {
                var activity = period[block.Id];
                var answers = activity.Where(a => a.Correct.HasValue).ToArray();
                var first = firstAnswers[block.Id].ToArray();
                return new { block.Id, block.Title, opened = activity.Where(a => a.Key == "open").Select(a => a.UserId).Distinct().Count(),
                    completed = activity.Where(a => a.Key == "complete").Select(a => a.UserId).Distinct().Count(), attempts = answers.Length,
                    firstCorrectPercent = first.Length == 0 ? (int?)null : first.Count(a => a.Correct == true) * 100 / first.Length };
            })
        };
    }
}
