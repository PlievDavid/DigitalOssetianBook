namespace IronLanguage.Db;

public sealed class UserAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsEditor { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WordEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Ossetian { get; set; } = "";
    public string Russian { get; set; } = "";
    public string Example { get; set; } = "";
    public string? AudioPath { get; set; }
    public bool Published { get; set; }
    public bool Archived { get; set; }
    public int Version { get; set; } = 1;
    public Guid? DictionarySenseId { get; set; }
    public string DictionaryNote { get; set; } = "";
}

public sealed class DictionarySense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int SourceRow { get; set; }
    public int SourceColumn { get; set; }
    public string Ossetian { get; set; } = "";
    public string Russian { get; set; } = "";
    public string RussianHeadword { get; set; } = "";
    public string Note { get; set; } = "";
    public bool Active { get; set; } = true;
}

public sealed class DictionaryForm
{
    public Guid SenseId { get; set; }
    public DictionarySense Sense { get; set; } = null!;
    public string SearchKey { get; set; } = "";
}

public sealed class Exercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = ""; // audio or translation
    public string RussianPrompt { get; set; } = "";
    public string OssetianAnswer { get; set; } = "";
    public string AlternativesJson { get; set; } = "[]";
    public string TokensJson { get; set; } = "[]";
    public string DistractorsJson { get; set; } = "[]"; // по два отвлекающих слова на каждый шаг (звуковой пазл)
    public string WordIdsJson { get; set; } = "[]";
    public string Explanation { get; set; } = "";
    public string? AudioPath { get; set; }
    public bool Published { get; set; }
    public bool Archived { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class Book
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "";
    public string Authors { get; set; } = "";
    public string Difficulty { get; set; } = "";
    public string Description { get; set; } = "";
    public string? CoverImagePath { get; set; }
    public string LiteraryTranslation { get; set; } = "";
    public bool Published { get; set; }
    public bool Archived { get; set; }
    public int Version { get; set; } = 1;
    public List<BookChapter> Chapters { get; set; } = [];
}

public sealed class BookChapter
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookId { get; set; }
    public Book Book { get; set; } = null!;
    public int Number { get; set; }
    public string Title { get; set; } = "";
    public string TokensJson { get; set; } = "[]";
}

public sealed class SavedWord
{
    public Guid UserId { get; set; }
    public Guid WordId { get; set; }
    public WordEntry Word { get; set; } = null!;
    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }
    public int Errors { get; set; }
}

public sealed class ExerciseAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid ExerciseId { get; set; }
    public int ExerciseVersion { get; set; }
    public string ExpectedAnswer { get; set; } = "";
    public string AlternativesJson { get; set; } = "[]";
    public string TokensJson { get; set; } = "[]";
    public string DistractorsJson { get; set; } = "[]";
    public string WordIdsJson { get; set; } = "[]";
    public string RussianPrompt { get; set; } = "";
    public string Explanation { get; set; } = "";
    public string? AudioPath { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public string DraftIndicesJson { get; set; } = "[]";
    public DateTimeOffset? CompletedAt { get; set; }
    public string? SubmittedAnswer { get; set; }
    public bool? Correct { get; set; }
}

public sealed class ContentRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = "";
    public Guid ContentId { get; set; }
    public int Version { get; set; }
    public int BaseVersion { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public bool Published { get; set; }
    public Guid EditorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PublishedAt { get; set; }
}

public sealed class ReadingPosition
{
    public Guid UserId { get; set; }
    public Guid BookId { get; set; }
    public Guid ChapterId { get; set; }
    public int TokenIndex { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DailyActivity
{
    public Guid UserId { get; set; }
    public DateOnly Day { get; set; }
    public int Points { get; set; }
}

public sealed class ExerciseReward
{
    public Guid UserId { get; set; }
    public Guid ExerciseId { get; set; }
    public DateOnly Day { get; set; }
}

public sealed class Achievement
{
    public Guid UserId { get; set; }
    public string Code { get; set; } = "";
    public DateTimeOffset AwardedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Dialogue
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "";
    public string Dialect { get; set; } = "";
    public int Level { get; set; } = 1;
    public string ScriptJson { get; set; } = "{}";
    public bool Published { get; set; }
    public bool Archived { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class DialogueSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid DialogueId { get; set; }
    public int DialogueVersion { get; set; }
    public string DialogueTitle { get; set; } = "";
    public string ScriptJson { get; set; } = "{}";
    public string StateJson { get; set; } = "{}";
    public int Attempts { get; set; }
    public int Errors { get; set; }
    public int Hints { get; set; }
    public int TurnsCompleted { get; set; }
    public int Revision { get; set; } = 1;
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class DialogueReward
{
    public Guid UserId { get; set; }
    public Guid DialogueId { get; set; }
    public DateOnly Day { get; set; }
}
