using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed record CourseRatingEligibility(int Completed, int Required, int Total)
{
    public bool Allowed => Total > 0 && Completed >= Required;
}

public static class CourseRatingProgress
{
    // Используем те же опубликованные уроки и правило актуальности попытки, что и боковая панель курса.
    public static async Task<CourseRatingEligibility?> Get(ICurriculumRepository repository, Guid courseId, Guid userId, CancellationToken ct)
    {
        var course = await repository.Get("course", courseId, false, ct);
        if (course is null) return null;
        var lessons = new List<CurriculumItem>();
        foreach (var id in CurriculumService.Parse(course).LessonIds)
        {
            var revision = await repository.Get("lesson", id, false, ct);
            if (revision is not null) lessons.Add(new CurriculumItem(revision, CurriculumService.Parse(revision)));
        }
        var completedRuns = (await repository.Runs(userId, ct)).Where(run => run.CompletedAt.HasValue).ToArray();
        var completed = lessons.Count(lesson => CurriculumService.LessonProgress(completedRuns, lesson) == 100);
        return new CourseRatingEligibility(completed, (lessons.Count + 1) / 2, lessons.Count);
    }
}
