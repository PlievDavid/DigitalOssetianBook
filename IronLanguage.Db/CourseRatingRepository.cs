namespace IronLanguage.Db;

public sealed class CourseRating
{
    public Guid CourseId { get; set; }
    public Guid UserId { get; set; }
    public int Score { get; set; }
}
