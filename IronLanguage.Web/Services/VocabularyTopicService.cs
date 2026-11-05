using System.Text.Json;
using System.Text;
using System.Security.Cryptography;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record VocabularyTopicSourceWord(string Answer, string Clue, int SourceRow, int SourceColumn)
{
    public Guid Key => new(SHA256.HashData(Encoding.UTF8.GetBytes($"adam-curated-word:{SourceRow}:{SourceColumn}"))[..16]);
}
public sealed record VocabularyTopicSource(int Id, int Version, string Title, VocabularyTopicSourceWord[] Words);
public sealed record VocabularyTopicWord(Guid SenseId, string Ossetian, string Russian, bool Saved);
public sealed record VocabularyTopicView(int Id, string Title, VocabularyTopicWord[] Words);

// Reuse the curated themes and exact dictionary source references already checked for crosswords.
// No inferred CEFR levels, frequency rankings, translations or automatic imports.
public sealed class VocabularyTopicCatalog
{
    public VocabularyTopicSource[] Topics { get; }
    public VocabularyTopicCatalog(IWebHostEnvironment environment)
    {
        var path = Path.Combine(environment.ContentRootPath, "Data", "crosswords", "levels.json");
        var sources = JsonSerializer.Deserialize<VocabularyTopicSource[]>(File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? [];
        Topics = sources.GroupBy(x => x.Id).Select(x => x.MaxBy(t => t.Version)!).OrderBy(x => x.Id).ToArray();
    }
}

public sealed class VocabularyTopicService(VocabularyTopicCatalog catalog, IWordReviewRepository repository, IProgressRepository progress, TimeProvider clock)
{
    public async Task<VocabularyTopicView[]> Topics(Guid? userId, CancellationToken ct)
    {
        var rows = catalog.Topics.SelectMany(x => x.Words).Select(x => x.SourceRow).Distinct().ToArray();
        var senses = await repository.TopicSenses(rows, ct);
        var saved = userId is Guid owner ? (await repository.SavedSenseIds(owner, ct)).ToHashSet() : [];
        var savedWords = userId is Guid uid ? (await repository.SavedWordIds(uid, ct)).ToHashSet() : [];
        return catalog.Topics.Select(topic => new VocabularyTopicView(topic.Id, topic.Title,
            topic.Words.Select(word =>
            {
                var sense = senses.FirstOrDefault(s => s.SourceRow == word.SourceRow && s.SourceColumn == word.SourceColumn && DictionaryService.Key(s.Ossetian) == DictionaryService.Key(word.Answer));
                return new VocabularyTopicWord(word.Key, word.Answer, word.Clue, savedWords.Contains(word.Key) || sense is not null && saved.Contains(sense.Id));
            }).DistinctBy(x => x.SenseId).ToArray()))
            .Where(x => x.Words.Length > 0).ToArray();
    }

    public async Task<int> Add(Guid userId, int topicId, Guid[] ids, CancellationToken ct)
    {
        if (ids.Length is 0 or > 64) throw new ArgumentException("Выберите слова из темы.");
        var topic = (await Topics(userId, ct)).SingleOrDefault(x => x.Id == topicId);
        if (topic is null || ids.Any(id => !topic.Words.Any(x => x.SenseId == id))) throw new ArgumentException("Слова не принадлежат выбранной теме.");
        var added = 0;
        foreach (var id in ids.Distinct())
        {
            if (topic.Words.Single(x => x.SenseId == id).Saved) continue;
            var wordId = await ResolveWord(topicId, id, ct);
            if (await progress.AddWord(userId, wordId, ct)) added++;
        }
        return added;
    }

    public async Task Rate(Guid userId, int topicId, Guid senseId, bool known, CancellationToken ct)
    {
        var wordId = await ResolveWord(topicId, senseId, ct);
        var now = clock.GetUtcNow();
        var stage = known ? WordReviewRules.KnownStage : -1;
        var dueAt = known ? now.Add(WordReviewRules.Intervals[stage]) : now;
        await repository.RateTopicWord(userId, wordId, stage, dueAt, known, now, ct);
    }

    private async Task<Guid> ResolveWord(int topicId, Guid id, CancellationToken ct)
    {
        var source = catalog.Topics.SingleOrDefault(x => x.Id == topicId)?.Words.FirstOrDefault(x => x.Key == id)
            ?? throw new ArgumentException("Слово не принадлежит выбранной теме.");
        var senses = await repository.TopicSenses([source.SourceRow], ct);
        var sense = senses.FirstOrDefault(s => s.SourceColumn == source.SourceColumn && DictionaryService.Key(s.Ossetian) == DictionaryService.Key(source.Answer));
        return await repository.EnsureTopicWord(new() { Id = id, Ossetian = source.Answer, Russian = source.Clue,
            Published = true, DictionarySenseId = sense?.Id }, ct);
    }
}
