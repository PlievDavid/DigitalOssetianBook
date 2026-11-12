using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record GroupingTile(int Index, string Text, int? Group, bool Solved);
public sealed record GroupingLinkedWord(Guid Id, string Ossetian, string Russian);
public sealed record GroupingBoard(Guid SessionId, Guid MaterialId, int Version, string Title,
    string[] Groups, GroupingTile[] Tiles, int Placed, int Total, bool Finished, GroupingLinkedWord[] Words);
public sealed record GroupingCheck(bool Correct, int Placed, int Total, bool Finished, GroupingTile[] Tiles);

public sealed class GroupingService(ICatalogRepository catalog, GuestLearningStore guests)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GroupingBoard?> Start(Guid owner, Guid sessionId, Guid materialId, CancellationToken ct)
    {
        var material = await catalog.Grouping(materialId, ct);
        if (material is null) return null;
        var payload = JsonSerializer.Deserialize<GroupingMaterial>(material.ScriptJson, JsonOptions)
            ?? throw new InvalidOperationException("Некорректный материал «Разбить слова на группы».");
        if (payload.Groups is null || payload.Words is null)
            throw new InvalidOperationException("В материале «Разбить слова на группы» нет групп или слов.");
        if (payload.Groups.Length is < GroupingScript.MinGroups or > GroupingScript.MaxGroups)
            throw new InvalidOperationException($"В материале «Разбить слова на группы» должно быть от {GroupingScript.MinGroups} до {GroupingScript.MaxGroups} групп.");
        if (payload.Words.Length is < GroupingScript.MinWords or > GroupingScript.MaxWords)
            throw new InvalidOperationException($"В материале «Разбить слова на группы» должно быть от {GroupingScript.MinWords} до {GroupingScript.MaxWords} слов.");
        if (payload.Words.Any(word => word is null || word.Group < 0 || word.Group >= payload.Groups.Length))
            throw new InvalidOperationException("В материале «Разбить слова на группы» указан неверный номер группы.");
        var order = Enumerable.Range(0, payload.Words.Length).ToList();
        Shuffle(order);
        var state = new GroupingState
        {
            MaterialId = material.Id, Version = material.Version, Title = material.Title,
            Groups = [.. payload.Groups],
            WordIds = [.. (payload.WordIds ?? [])],
            Texts = [.. order.Select(index => payload.Words[index].Text)],
            CorrectGroup = [.. order.Select(index => payload.Words[index].Group)],
            GroupOfWord = Enumerable.Repeat(-1, order.Count).ToArray(),
            Solved = new bool[order.Count]
        };
        guests.Add(owner, sessionId, state);
        var words = await Words(state.WordIds, ct);
        return Board(sessionId, state, words);
    }

    public async Task<GroupingCheck?> Check(Guid owner, Guid sessionId, int wordIndex, int groupIndex, CancellationToken ct)
    {
        var entry = guests.Find<GroupingState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            if (wordIndex < 0 || wordIndex >= state.Texts.Length || groupIndex < 0 || groupIndex >= state.Groups.Length)
                throw new ArgumentException("Неверная группа или слово.");
            // Повтор уже зачтённого слова (сбой сети) не начисляет прогресс дважды и не меняет закреплённую группу.
            if (state.Solved[wordIndex])
                return new GroupingCheck(true, state.Placed, state.Texts.Length, state.Placed == state.Texts.Length, Tiles(state));
            var correct = state.CorrectGroup[wordIndex] == groupIndex;
            if (correct)
            {
                state.GroupOfWord[wordIndex] = groupIndex;
                state.Solved[wordIndex] = true;
                state.Placed++;
            }
            return new GroupingCheck(correct, state.Placed, state.Texts.Length, state.Placed == state.Texts.Length, Tiles(state));
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<GroupingBoard?> Board(Guid owner, Guid sessionId, CancellationToken ct)
    {
        var entry = guests.Find<GroupingState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            return Board(sessionId, entry.Value, await WordsFor(entry.Value, ct));
        }
        finally { entry.Gate.Release(); }
    }

    private async Task<GroupingLinkedWord[]> WordsFor(GroupingState state, CancellationToken ct) =>
        await Words(state.WordIds, ct);

    private async Task<GroupingLinkedWord[]> Words(Guid[] wordIds, CancellationToken ct)
    {
        var words = new List<GroupingLinkedWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new GroupingLinkedWord(word.Id, word.Ossetian, word.Russian));
        }
        return [.. words];
    }

    private static GroupingTile[] Tiles(GroupingState state) => [.. state.Texts.Select((text, index) => new GroupingTile(
        index, text, state.Solved[index] ? state.GroupOfWord[index] : null, state.Solved[index]))];

    private static GroupingBoard Board(Guid sessionId, GroupingState state, GroupingLinkedWord[] words) => new(
        sessionId, state.MaterialId, state.Version, state.Title,
        [.. state.Groups], Tiles(state), state.Placed, state.Texts.Length, state.Placed == state.Texts.Length, words);

    private static void Shuffle<T>(List<T> values)
    {
        for (var i = values.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (values[i], values[j]) = (values[j], values[i]);
        }
    }

    public sealed class GroupingState
    {
        public Guid MaterialId { get; init; }
        public int Version { get; init; }
        public string Title { get; init; } = "";
        public string[] Groups { get; init; } = [];
        public Guid[] WordIds { get; init; } = [];
        public string[] Texts { get; init; } = [];
        public int[] CorrectGroup { get; init; } = [];
        public int[] GroupOfWord { get; set; } = [];
        public bool[] Solved { get; set; } = [];
        public int Placed { get; set; }
    }
}
