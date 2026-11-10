using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class AdamDbContext(DbContextOptions<AdamDbContext> options) : IdentityDbContext<UserAccount, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<WordEntry> Words => Set<WordEntry>();
    public DbSet<DictionarySense> DictionarySenses => Set<DictionarySense>();
    public DbSet<DictionaryForm> DictionaryForms => Set<DictionaryForm>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<BookChapter> Chapters => Set<BookChapter>();
    public DbSet<SavedWord> SavedWords => Set<SavedWord>();
    public DbSet<ExerciseAttempt> Attempts => Set<ExerciseAttempt>();
    public DbSet<ReadingPosition> ReadingPositions => Set<ReadingPosition>();
    public DbSet<DailyActivity> DailyActivities => Set<DailyActivity>();
    public DbSet<ExerciseReward> ExerciseRewards => Set<ExerciseReward>();
    public DbSet<Achievement> Achievements => Set<Achievement>();
    public DbSet<ContentRevision> ContentRevisions => Set<ContentRevision>();
    public DbSet<Dialogue> Dialogues => Set<Dialogue>();
    public DbSet<Matching> Matchings => Set<Matching>();
    public DbSet<PictureMatching> PictureMatchings => Set<PictureMatching>();
    public DbSet<Grammar> Grammars => Set<Grammar>();
    public DbSet<DialogueSession> DialogueSessions => Set<DialogueSession>();
    public DbSet<DialogueReward> DialogueRewards => Set<DialogueReward>();
    public DbSet<CrosswordSolvedWord> CrosswordSolvedWords => Set<CrosswordSolvedWord>();
    public DbSet<WordleGame> WordleGames => Set<WordleGame>();
    public DbSet<CourseRating> CourseRatings => Set<CourseRating>();
    public DbSet<LessonRun> LessonRuns => Set<LessonRun>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<LibraryLesson> LibraryLessons => Set<LibraryLesson>();
    public DbSet<CourseVersion> CourseVersions => Set<CourseVersion>();
    public DbSet<CourseEnrollment> CourseEnrollments => Set<CourseEnrollment>();
    public DbSet<CourseLessonSession> CourseLessonSessions => Set<CourseLessonSession>();
    public DbSet<CourseMaterialAccess> CourseMaterialAccesses => Set<CourseMaterialAccess>();
    public DbSet<CoursePracticeRun> CoursePracticeRuns => Set<CoursePracticeRun>();
    public DbSet<CourseBlockActivity> CourseBlockActivities => Set<CourseBlockActivity>();

    public DbSet<AdminAudit> AdminAudits => Set<AdminAudit>();
    public DbSet<DailyMetric> DailyMetrics => Set<DailyMetric>();
    public DbSet<AnalyticsState> AnalyticsStates => Set<AnalyticsState>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        base.OnModelCreating(model);
        model.Entity<CourseMaterialAccess>().HasKey(x => new { x.Kind, x.MaterialId });
        model.Entity<CoursePracticeRun>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<CourseBlockActivity>().HasKey(x => new { x.UserId, x.VersionId, x.BlockId, x.Key });
        model.Entity<CourseBlockActivity>().HasIndex(x => new { x.CourseId, x.At });
        model.Entity<CourseBlockActivity>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<CourseMaterialAccess>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<LibraryLesson>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<LibraryLesson>().HasIndex(x => new { x.OwnerId, x.SourceCourseId, x.SourceLessonId, x.SourceStamp }).IsUnique();
        model.Entity<CourseLessonSession>().HasIndex(x => new { x.UserId, x.VersionId, x.LessonId }).IsUnique().HasFilter("\"CompletedAt\" IS NULL");
        model.Entity<CourseLessonSession>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<CourseLessonSession>().HasOne<CourseVersion>().WithMany().HasForeignKey(x => new { x.VersionId, x.CourseId })
            .HasPrincipalKey(x => new { x.Id, x.CourseId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Course>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Course>().HasOne<CourseVersion>().WithMany().HasForeignKey(x => new { x.PublishedVersionId, x.Id })
            .HasPrincipalKey(x => new { x.Id, x.CourseId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<CourseVersion>().HasOne<Course>().WithMany().HasForeignKey(x => x.CourseId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<CourseVersion>().HasIndex(x => new { x.CourseId, x.Number }).IsUnique();
        model.Entity<CourseVersion>().HasIndex(x => new { x.CourseId, x.SourceDraftStamp }).IsUnique();
        model.Entity<CourseEnrollment>().HasIndex(x => new { x.UserId, x.CourseId }).IsUnique();
        model.Entity<CourseEnrollment>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<CourseEnrollment>().HasOne<CourseVersion>().WithMany().HasForeignKey(x => new { x.VersionId, x.CourseId })
            .HasPrincipalKey(x => new { x.Id, x.CourseId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<UserAccount>().ToTable("Users");
        model.Entity<AdminAudit>().HasIndex(x => x.CreatedAt);
        model.Entity<DailyMetric>().HasKey(x => new { x.Day, x.Section, x.Event });
        model.Entity<AnalyticsState>().HasKey(x => x.Id);
        model.Entity<CourseRating>().HasKey(x => new { x.CourseId, x.UserId });
        model.Entity<CourseRating>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<CourseRating>().ToTable(t => t.HasCheckConstraint("CK_CourseRatings_Score", "\"Score\" >= 1 AND \"Score\" <= 5"));
        model.Entity<WordleGame>().HasKey(x => new { x.UserId, x.Day });
        model.Entity<WordleGame>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<WordleGame>().Property(x => x.ExpectedWord).HasMaxLength(5);
        model.Entity<WordleGame>().Property(x => x.Russian).HasMaxLength(250);
        model.Entity<WordleGame>().Property(x => x.GuessesJson).HasMaxLength(1024);
        model.Entity<CrosswordSolvedWord>().HasKey(x => new { x.UserId, x.LevelId, x.Version, x.WordId });
        model.Entity<CrosswordSolvedWord>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<UserAccount>().HasIndex(x => x.Email).IsUnique();
        model.Entity<UserAccount>().Property(x => x.AvatarJson).HasMaxLength(2048);
        model.Entity<UserAccount>().Property(x => x.PublicName).HasMaxLength(100);
        model.Entity<LessonRun>().HasIndex(x => new { x.UserId, x.LessonId }).IsUnique().HasFilter("\"CompletedAt\" IS NULL");
        model.Entity<WordEntry>().HasIndex(x => x.Ossetian);
        model.Entity<WordEntry>().HasIndex(x => x.DictionarySenseId).IsUnique();
        model.Entity<DictionarySense>().HasIndex(x => new { x.SourceRow, x.SourceColumn });
        model.Entity<DictionaryForm>().HasKey(x => new { x.SenseId, x.SearchKey });
        model.Entity<DictionaryForm>().HasIndex(x => x.SearchKey);
        model.Entity<DictionaryForm>().HasOne(x => x.Sense).WithMany().HasForeignKey(x => x.SenseId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<BookChapter>().HasIndex(x => new { x.BookId, x.Number }).IsUnique();
        model.Entity<SavedWord>().HasKey(x => new { x.UserId, x.WordId });
        model.Entity<ReadingPosition>().HasKey(x => new { x.UserId, x.BookId });
        model.Entity<DailyActivity>().HasKey(x => new { x.UserId, x.Day });
        model.Entity<ExerciseReward>().HasKey(x => new { x.UserId, x.ExerciseId, x.Day });
        model.Entity<Achievement>().HasKey(x => new { x.UserId, x.Code });
        model.Entity<ExerciseAttempt>().HasIndex(x => new { x.UserId, x.ExerciseId, x.CompletedAt });
        model.Entity<ContentRevision>().HasIndex(x => new { x.Kind, x.ContentId, x.Version }).IsUnique().HasFilter("\"Published\"");
        model.Entity<ContentRevision>().HasIndex(x => new { x.Kind, x.ContentId }).IsUnique().HasFilter("NOT \"Published\"");
        model.Entity<SavedWord>().HasOne(x => x.Word).WithMany().HasForeignKey(x => x.WordId);
        model.Entity<BookChapter>().HasOne(x => x.Book).WithMany(x => x.Chapters).HasForeignKey(x => x.BookId);
        model.Entity<DialogueReward>().HasKey(x => new { x.UserId, x.DialogueId, x.Day });
        model.Entity<DialogueSession>().HasIndex(x => new { x.UserId, x.DialogueId, x.CompletedAt });
        model.Entity<Grammar>().HasIndex(x => new { x.Published, x.Archived });
    }
}
