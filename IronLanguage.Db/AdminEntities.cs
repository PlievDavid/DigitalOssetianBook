using System.ComponentModel.DataAnnotations;
namespace IronLanguage.Db;

public sealed class AdminAudit
{
    public long Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ActorId { get; set; }
    public Guid TargetId { get; set; }
    [MaxLength(40)] public string Action { get; set; } = "";
    [MaxLength(500)] public string Reason { get; set; } = "";
    [MaxLength(500)] public string Before { get; set; } = "";
    [MaxLength(500)] public string After { get; set; } = "";
}
public sealed class DailyMetric
{
    public DateOnly Day { get; set; }
    [MaxLength(40)] public string Section { get; set; } = "";
    [MaxLength(40)] public string Event { get; set; } = "";
    public long Count { get; set; }
}
public sealed class AnalyticsState
{
    public int Id { get; set; }
    public DateTimeOffset StartedAt { get; set; }
}
