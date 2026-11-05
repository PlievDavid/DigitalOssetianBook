using IronLanguage.Db;
using IronLanguage.Web.Services;

internal sealed class ReviewMemoryRepository : IWordReviewRepository
{
    public readonly Dictionary<Guid, WordReviewSession> Sessions = [];
    public readonly Dictionary<(Guid, Guid, bool), WordReviewState> States = [];
    public readonly Dictionary<Guid, WordReviewSettings> Preferences = [];
    public readonly List<ReviewSource> Words = [];
    public readonly HashSet<(Guid, Guid, DateOnly)> Rewards = [];
    public Task<ReviewCounts> Counts(Guid userId, DateTimeOffset now, CancellationToken ct) => throw new NotSupportedException();
    public Task<VocabularyPage> Page(Guid userId, string search, string status, string sort, int page, int size, CancellationToken ct) => throw new NotSupportedException();
    public Task<VocabularyPage> Available(Guid? userId, string search, int page, CancellationToken ct) => throw new NotSupportedException();
    public Task<List<ReviewSource>> Sources(Guid userId, CancellationToken ct) => Task.FromResult(Words.Where(x => x.Saved.UserId == userId).Select(x => x with { Forward = States.GetValueOrDefault((userId,x.Saved.WordId,false)), Backward = States.GetValueOrDefault((userId,x.Saved.WordId,true)) }).ToList());
    public Task<WordReviewSettings> Settings(Guid userId, CancellationToken ct) => Task.FromResult(Preferences.GetValueOrDefault(userId) ?? new() { UserId = userId });
    public Task SaveSettings(WordReviewSettings settings, CancellationToken ct) { Preferences[settings.UserId] = settings; return Task.CompletedTask; }
    public Task<WordReviewSession?> Session(Guid userId, CancellationToken ct) => Task.FromResult(Sessions.GetValueOrDefault(userId));
    public Task Start(WordReviewSession session, CancellationToken ct) { Sessions[session.UserId] = session; return Task.CompletedTask; }
    public Task<WordReviewSession?> Mutate(Guid userId, Guid id, Guid? wordId, bool reverse, DateTimeOffset now, Func<WordReviewSession, WordReviewState?, SavedWord?, ReviewWrite> action, CancellationToken ct)
    {
        var session = Sessions.GetValueOrDefault(userId); if (session?.Id != id) return Task.FromResult<WordReviewSession?>(null);
        var saved = Words.FirstOrDefault(x => x.Saved.UserId == userId && x.Saved.WordId == wordId)?.Saved;
        var state = wordId is null || saved is null ? null : States.GetValueOrDefault((userId,wordId.Value,reverse)) ?? new() { UserId=userId,WordId=wordId.Value,Reverse=reverse };
        var write = action(session,state,saved);
        if (state?.DueAt is not null) States[(userId,wordId!.Value,reverse)] = state;
        if ((write.MarkKnown || write.Introduce) && wordId is Guid whole && state is not null) {
            var other=States.GetValueOrDefault((userId,whole,!reverse))??new(){UserId=userId,WordId=whole,Reverse=!reverse};
            other.Stage=write.MarkKnown?state.Stage:other.Stage<0?-1:Math.Max(0,other.Stage-1);other.DueAt=write.MarkKnown?state.DueAt:now;other.Mastered=write.MarkKnown;States[(userId,whole,!reverse)]=other;
        }
        if (write.Award && wordId is Guid word) {
            var day = DateOnly.FromDateTime(now.UtcDateTime);
            if (Rewards.Count(x => x.Item1==userId && x.Item3==day) < 20 && Rewards.Add((userId,word,day))) session.Points++;
        }
        return Task.FromResult<WordReviewSession?>(session);
    }
    public Task<DictionarySense[]> TopicSenses(int[] rows, CancellationToken ct) => Task.FromResult(Array.Empty<DictionarySense>());
    public Task<Guid[]> SavedSenseIds(Guid userId, CancellationToken ct) => Task.FromResult(Array.Empty<Guid>());
    public Task<Guid[]> SavedWordIds(Guid userId, CancellationToken ct) => Task.FromResult(Array.Empty<Guid>());
    public Task<Guid> EnsureTopicWord(WordEntry word, CancellationToken ct) => Task.FromResult(word.Id);
    public Task<MasteryDay[]> MasteryWeek(Guid userId, DateOnly today, CancellationToken ct) => throw new NotSupportedException();
    public Task RateTopicWord(Guid userId, Guid wordId, int stage, DateTimeOffset dueAt, bool known, DateTimeOffset now, CancellationToken ct) => throw new NotSupportedException();
}
