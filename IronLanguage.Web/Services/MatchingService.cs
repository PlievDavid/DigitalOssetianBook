using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record MatchingTile(int Index, string Text, bool Matched);
public sealed record MatchingWord(Guid Id, string Ossetian, string Russian);
public sealed record MatchingBoard(Guid SessionId, Guid MaterialId, int Version, string Title,
    MatchingTile[] Left, MatchingTile[] Right, int Matched, int Total, bool Finished, MatchingWord[] Words);
public sealed record MatchingCheck(bool Correct, int Matched, int Total, bool Finished);

public sealed class MatchingService(ICatalogRepository catalog, GuestLearningStore guests)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<MatchingBoard?> Start(Guid owner, Guid sessionId, Guid materialId, CancellationToken ct)
    {
        var material = await catalog.Matching(materialId, ct);
        if (material is null) return null;
        var payload = JsonSerializer.Deserialize<MatchingMaterial>(material.ScriptJson, JsonOptions)
            ?? throw new InvalidOperationException("Некорректный материал соотнесения.");
        var rights = payload.Pairs.Select((pair, index) => (Text: pair.Right, Source: index))
            .Concat(payload.Distractors.Select(text => (Text: text, Source: -1))).ToList();
        Shuffle(rights);
        var state = new MatchingState
        {
            MaterialId = material.Id, Version = material.Version, Title = material.Title,
            Lefts = payload.Pairs.Select(x => x.Left).ToArray(),
            Rights = rights.Select(x => x.Text).ToArray(),
            RightSource = rights.Select(x => x.Source).ToArray(),
            MatchedByLeft = Enumerable.Repeat(-1, payload.Pairs.Length).ToArray(),
            RightLocked = new bool[rights.Count]
        };
        guests.Add(owner, sessionId, state);
        var words = await Words(payload.WordIds, ct);
        return Board(sessionId, state, words);
    }

    public async Task<MatchingCheck?> Check(Guid owner, Guid sessionId, int leftIndex, int rightIndex, CancellationToken ct)
    {
        var entry = guests.Find<MatchingState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            if (leftIndex < 0 || leftIndex >= state.Lefts.Length || rightIndex < 0 || rightIndex >= state.Rights.Length)
                throw new ArgumentException("Неверный выбор пары.");
            if (state.MatchedByLeft[leftIndex] >= 0 || state.RightLocked[rightIndex])
                return new MatchingCheck(false, state.Matched, state.Lefts.Length, state.Matched == state.Lefts.Length);
            var correct = state.RightSource[rightIndex] == leftIndex;
            if (correct)
            {
                state.MatchedByLeft[leftIndex] = rightIndex;
                state.RightLocked[rightIndex] = true;
                state.Matched++;
            }
            return new MatchingCheck(correct, state.Matched, state.Lefts.Length, state.Matched == state.Lefts.Length);
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<MatchingBoard?> Board(Guid owner, Guid sessionId, CancellationToken ct)
    {
        var entry = guests.Find<MatchingState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            return Board(sessionId, entry.Value, await WordsFor(entry.Value, ct));
        }
        finally { entry.Gate.Release(); }
    }

    private async Task<MatchingWord[]> WordsFor(MatchingState state, CancellationToken ct)
    {
        var material = await catalog.Matching(state.MaterialId, ct);
        if (material is null) return [];
        var payload = JsonSerializer.Deserialize<MatchingMaterial>(material.ScriptJson, JsonOptions);
        return payload is null ? [] : await Words(payload.WordIds, ct);
    }

    private async Task<MatchingWord[]> Words(Guid[] wordIds, CancellationToken ct)
    {
        var words = new List<MatchingWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new MatchingWord(word.Id, word.Ossetian, word.Russian));
        }
        return [.. words];
    }

    private static MatchingBoard Board(Guid sessionId, MatchingState state, MatchingWord[] words) => new(
        sessionId, state.MaterialId, state.Version, state.Title,
        [.. state.Lefts.Select((text, index) => new MatchingTile(index, text, state.MatchedByLeft[index] >= 0))],
        [.. state.Rights.Select((text, index) => new MatchingTile(index, text, state.RightLocked[index]))],
        state.Matched, state.Lefts.Length, state.Matched == state.Lefts.Length, words);

    private static void Shuffle<T>(List<T> values)
    {
        for (var i = values.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (values[i], values[j]) = (values[j], values[i]);
        }
    }

    public sealed class MatchingState
    {
        public Guid MaterialId { get; init; }
        public int Version { get; init; }
        public string Title { get; init; } = "";
        public string[] Lefts { get; init; } = [];
        public string[] Rights { get; init; } = [];
        public int[] RightSource { get; init; } = [];
        public int[] MatchedByLeft { get; set; } = [];
        public bool[] RightLocked { get; set; } = [];
        public int Matched { get; set; }
    }
}
