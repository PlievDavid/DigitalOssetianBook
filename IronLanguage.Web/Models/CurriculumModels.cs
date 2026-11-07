using IronLanguage.Db;

namespace IronLanguage.Web.Models;

public sealed class CurriculumDocument
{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Outcomes { get; set; } = "";
    public string Audience { get; set; } = "";
    public string? CoverPath { get; set; }
    public Guid[] LessonIds { get; set; } = [];
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
    public string StructureJson { get; set; } = "[]";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string Stamp { get; set; } = "";
}

public sealed record CurriculumItem(ContentRevision Revision, CurriculumDocument Document);
public sealed record CurriculumChoice(Guid Id, string Kind, string Title, bool Published = true);
public sealed record CurriculumEditorModel(string Kind, Guid Id, CurriculumForm Form, CurriculumChoice[] Choices);
public sealed record CurriculumPreview(string Kind, ContentRevision Revision, CurriculumDocument Document, CurriculumChoice[] Choices, string? Error = null);
public sealed record CoursePage(CurriculumItem Course, CurriculumItem[] Lessons, List<LessonRun> Runs, CurriculumAuthor? Author = null);
public sealed record LessonSnapshot(string Title, CurriculumCard[] Cards, Guid?[] AttemptIds)
{
    public int[]? CompletedSteps { get; init; }
}
public sealed record LessonPage(LessonRun Run, LessonSnapshot Snapshot, string? Error = null, CoursePage? Course = null, int SelectedStep = 0, int[]? CompletedSteps = null);

public sealed record CurriculumCatalog(CurriculumItem[] Items, CurriculumItem[] Lessons, List<LessonRun> Runs, string Kind, string Query, string Filter, Dictionary<Guid, CurriculumAuthor>? Authors = null, Dictionary<Guid, CourseRatingSummary>? Ratings = null);

public sealed record PublicAuthorPage(CurriculumAuthor Author, CurriculumItem[] Courses, AvatarOptions Avatar);
