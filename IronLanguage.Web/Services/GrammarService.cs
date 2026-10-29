using System.Text.Json;
using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record GrammarWord(Guid Id, string Ossetian, string Russian);
public sealed record GrammarSentenceWord(string Text, int Position, DictionaryMatch[] Matches);
public sealed record GrammarMeaningView(Guid Id, string Ossetian, string Russian, string RussianHeadword, string Note);
public sealed record GrammarSessionState(Guid SessionId, Guid MaterialId, int Version, string Title,
    string Prompt, string Blank, string[] Options, bool Answered, int Attempts, bool Correct,
    string? CorrectForm, bool ShowRule, string Rule, GrammarWord[] Words,
    GrammarSentenceWord[] Sentence, GrammarMeaningView[] Dictionary);
public sealed record GrammarCheckResult(bool Correct, bool Finished, string? CorrectForm,
    bool ShowRule, string Rule, int Attempts, GrammarWord[] Words,
    GrammarSentenceWord[] Sentence, GrammarMeaningView[] Dictionary);

public sealed class GrammarService(ICatalogRepository catalog, GuestLearningStore guests)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const int MaxAttempts = 2;

    public async Task<GrammarSessionState?> Start(Guid owner, Guid sessionId, Guid materialId, CancellationToken ct)
    {
        var material = await catalog.Grammar(materialId, ct);
        if (material is null) return null;
        var payload = JsonSerializer.Deserialize<GrammarMaterial>(material.ScriptJson, JsonOptions)
            ?? throw new InvalidOperationException("Некорректный материал «форма слова».");
        var state = new GrammarState
        {
            MaterialId = material.Id, Version = material.Version, Title = material.Title,
            Prompt = payload.Prompt, Blank = payload.Blank,
            CorrectForm = payload.Correct, Rule = payload.Rule,
            Options = Shuffle([payload.Correct, .. payload.Distractors]),
            WordIds = payload.WordIds
        };
        guests.Add(owner, sessionId, state);
        return await Board(owner, sessionId, ct);
    }

    public async Task<GrammarCheckResult?> Check(Guid owner, Guid sessionId, int? optionIndex, CancellationToken ct)
    {
        var entry = guests.Find<GrammarState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            if (state.Answered)
                return await FinishedResult(state, ct);
            var correct = CheckChoice(state, optionIndex);
            state.Attempts++;
            if (correct || state.Attempts >= MaxAttempts)
            {
                state.Answered = true;
                state.Correct = correct;
                return await FinishedResult(state, ct);
            }
            // Первая ошибка: подсказка, правильная форма скрыта, варианты остаются.
            return new GrammarCheckResult(false, false, null, state.Rule.Length > 0, state.Rule,
                state.Attempts, [], Sentence(state, null), []);
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<GrammarSessionState?> Board(Guid owner, Guid sessionId, CancellationToken ct)
    {
        var entry = guests.Find<GrammarState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            var showRule = state.Answered || state.Attempts > 0;
            var words = state.Answered ? await Words(state.WordIds, ct) : [];
            var options = state.Answered ? [] : state.Options;
            return new GrammarSessionState(sessionId, state.MaterialId, state.Version, state.Title,
                state.Prompt, state.Blank, options, state.Answered, state.Attempts,
                state.Answered ? state.Correct : false,
                state.Answered ? state.CorrectForm : null,
                showRule, showRule ? state.Rule : "",
                words, Sentence(state, state.Answered ? state.CorrectForm : null), []);
        }
        finally { entry.Gate.Release(); }
    }

    // Связанные слова нужны и в финальном ответе: клиент рендерит их из check.
    private async Task<GrammarCheckResult> FinishedResult(GrammarState state, CancellationToken ct) =>
        new(state.Correct, true, state.CorrectForm, state.Rule.Length > 0, state.Rule,
            state.Attempts, await Words(state.WordIds, ct),
            Sentence(state, state.Answered ? state.CorrectForm : null), []);

    private static bool CheckChoice(GrammarState state, int? optionIndex)
    {
        if (optionIndex is not int index || index < 0 || index >= state.Options.Length)
            throw new ArgumentException("Выберите вариант ответа.");
        var selected = state.Options[index];
        return GrammarScript.Normalize(selected) == GrammarScript.Normalize(state.CorrectForm);
    }

    /// <summary>Меняет метку пропуска на правильную форму для показа после верного ответа.</summary>
    public static string InsertForm(string prompt, string blank, string form)
    {
        if (string.IsNullOrEmpty(blank)) return prompt;
        var index = prompt.IndexOf(blank, StringComparison.Ordinal);
        return index < 0 ? prompt : prompt[..index] + form + prompt[(index + blank.Length)..];
    }

    private static readonly Regex WordPattern = new(@"[\p{L}\p{M}]+", RegexOptions.Compiled);

    /// <summary>Токенизирует предложение; слова, попавшие в метку пропуска, пропускаются.</summary>
    public static GrammarSentenceWord[] Tokenize(string prompt, string blank, string? insertForm)
    {
        var shown = insertForm is null ? prompt : InsertForm(prompt, blank, insertForm);
        var blankStart = insertForm is null
            ? (string.IsNullOrEmpty(blank) ? -1 : prompt.IndexOf(blank, StringComparison.Ordinal))
            : -1;
        var blankEnd = blankStart >= 0 ? blankStart + blank.Length : -1;
        var result = new List<GrammarSentenceWord>();
        foreach (Match match in WordPattern.Matches(shown))
        {
            if (blankStart >= 0 && match.Index < blankEnd && match.Index + match.Length > blankStart) continue;
            result.Add(new GrammarSentenceWord(match.Value, match.Index, []));
        }
        return [.. result];
    }

    private static GrammarSentenceWord[] Sentence(GrammarState state, string? insertForm) =>
        Tokenize(state.Prompt, state.Blank, insertForm);

    private async Task<GrammarWord[]> Words(Guid[] wordIds, CancellationToken ct)
    {
        var words = new List<GrammarWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new GrammarWord(word.Id, word.Ossetian, word.Russian));
        }
        return [.. words];
    }

    private static string[] Shuffle(string[] values)
    {
        var list = values.ToList();
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return [.. list];
    }

    public sealed class GrammarState
    {
        public Guid MaterialId { get; init; }
        public int Version { get; init; }
        public string Title { get; init; } = "";
        public string Prompt { get; init; } = "";
        public string Blank { get; init; } = "___";
        public string CorrectForm { get; init; } = "";
        public string Rule { get; init; } = "";
        public string[] Options { get; init; } = [];
        public Guid[] WordIds { get; init; } = [];
        public bool Answered { get; set; }
        public bool Correct { get; set; }
        public int Attempts { get; set; }
    }
}
