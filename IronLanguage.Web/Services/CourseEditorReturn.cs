namespace IronLanguage.Web.Services;

internal static class CourseEditorReturn
{
    public static string Query(Guid? courseId, Guid? lessonId) =>
        courseId is Guid course && lessonId is Guid lesson ? $"?courseId={course}&lessonId={lesson}" : "";

    public static string? Url(Guid? courseId, Guid? lessonId) =>
        courseId is Guid course && lessonId is Guid lesson ? $"/author/courses/{course}?lesson={lesson}" : null;
}
