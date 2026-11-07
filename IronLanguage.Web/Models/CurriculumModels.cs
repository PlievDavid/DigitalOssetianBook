using IronLanguage.Db;

namespace IronLanguage.Web.Models;

public sealed record CourseModule(string Title, Guid[] LessonIds);

public sealed class CurriculumDocument
{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Outcomes { get; set; } = "";
    public string Audience { get; set; } = "";
    public string? CoverPath { get; set; }
    public Guid[] LessonIds { get; set; } = [];
    public CourseModule[] Modules { get; set; } = [];
    public Guid[] WordIds { get; set; } = [];
    public string Goal { get; set; } = "";
    public int? Minutes { get; set; }
    public int? ProgressFromVersion { get; set; }
    public CurriculumCard[] Cards { get; set; } = [];
}

public sealed class CurriculumCard
{
    public string Kind { get; set; } = "theory";
    public string Template { get; set; } = "text";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string Secondary { get; set; } = "";
    public Guid MaterialId { get; set; }
}

public sealed class CurriculumForm
{
    public string Title { get; set; } = "";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string Description { get; set; } = "";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string Outcomes { get; set; } = "";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string Audience { get; set; } = "";
    public string? CoverPath { get; set; }
    public string? Goal { get; set; }
    public int? Minutes { get; set; }
    public string ModulesJson { get; set; } = "[]";
    public Guid[] WordIds { get; set; } = [];
    public string StructureJson { get; set; } = "[]";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string Stamp { get; set; } = "";
}

public sealed record CurriculumItem(ContentRevision Revision, CurriculumDocument Document);
public sealed record CurriculumChoice(Guid Id, string Kind, string Title, bool Published = true);
public sealed record CurriculumEditorModel(string Kind, Guid Id, CurriculumForm Form, CurriculumChoice[] Choices);
public sealed record CurriculumPreview(string Kind, ContentRevision Revision, CurriculumDocument Document, CurriculumChoice[] Choices, string? Error = null);
public sealed record CoursePage(CurriculumItem Course, CurriculumItem[] Lessons, List<LessonRun> Runs, CurriculumAuthor? Author = null)
{
    public IEnumerable<(string? Title, CurriculumItem[] Lessons)> Sections()
    {
        var assigned = Course.Document.Modules.SelectMany(module => module.LessonIds).ToHashSet();
        foreach (var module in Course.Document.Modules)
        {
            var lessons = module.LessonIds.Select(id => Lessons.FirstOrDefault(item => item.Revision.ContentId == id))
                .OfType<CurriculumItem>().ToArray();
            if (lessons.Length > 0) yield return (module.Title, lessons);
        }
        var other = Lessons.Where(item => !assigned.Contains(item.Revision.ContentId)).ToArray();
        if (other.Length > 0) yield return (assigned.Count > 0 ? "Другие уроки" : null, other);
    }
}
public sealed record LessonSnapshot(string Title, CurriculumCard[] Cards, Guid?[] AttemptIds)
{
    public string? Goal { get; init; }
    public int? Minutes { get; init; }
    public Guid? CourseId { get; init; }
    public Guid[] WordIds { get; init; } = [];
    public int[]? CompletedSteps { get; init; }
}
public sealed record LessonPage(LessonRun Run, LessonSnapshot Snapshot, string? Error = null, CoursePage? Course = null, int SelectedStep = 0, int[]? CompletedSteps = null);

public sealed record CurriculumCatalog(CurriculumItem[] Items, CurriculumItem[] Lessons, List<LessonRun> Runs, string Kind, string Query, string Filter, Dictionary<Guid, CurriculumAuthor>? Authors = null, Dictionary<Guid, CourseRatingSummary>? Ratings = null);

public sealed record PublicAuthorPage(CurriculumAuthor Author, CurriculumItem[] Courses, AvatarOptions Avatar);

public sealed record CourseReport(string Title, LessonReport[] Lessons);
public sealed record LessonReport(string Title, int Started, int Completed, CardReport[] Cards);
public sealed record CardReport(int Version, int Number, string Title, int Unfinished, int Answered, int Incorrect);
