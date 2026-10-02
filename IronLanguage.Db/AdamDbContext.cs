using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class AdamDbContext(DbContextOptions<AdamDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
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

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<UserAccount>().HasIndex(x => x.Email).IsUnique();
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
    }
}
