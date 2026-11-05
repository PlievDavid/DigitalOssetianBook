namespace IronLanguage.Db;

public sealed class WordReviewState
{
    public Guid UserId { get; set; }
    public Guid WordId { get; set; }
    public bool Reverse { get; set; }
    public int Stage { get; set; } = -1;
    public DateTimeOffset? DueAt { get; set; }
    public int ChoiceDays { get; set; }
    public DateOnly? LastChoiceDay { get; set; }
    public int Errors { get; set; }
    public bool Mastered { get; set; }
}

public sealed class WordReviewSettings
{
    public Guid UserId { get; set; }
    public string Format { get; set; } = "cards";
    public bool DirectInput { get; set; }
}

// One resumable snapshot per account. Starting again invalidates links to the old session.
public sealed class WordReviewSession
{
    public Guid UserId { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset StartedAt { get; set; }
    public string Mode { get; set; } = "mixed";
    public string Format { get; set; } = "cards";
    public string ItemsJson { get; set; } = "[]";
    public int Index { get; set; }
    public bool Revealed { get; set; }
    public string? ResultJson { get; set; }
    public int Correct { get; set; }
    public int Errors { get; set; }
    public int Skipped { get; set; }
    public int Points { get; set; }
}

public sealed class WordReviewReward
{
    public Guid UserId { get; set; }
    public Guid WordId { get; set; }
    public DateOnly Day { get; set; }
}

public sealed class WordReviewMastery
{
    public Guid UserId { get; set; }
    public Guid WordId { get; set; }
    public DateOnly Day { get; set; }
}
