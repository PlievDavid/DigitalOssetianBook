using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public static class DialogueScript
{
    public const string StudentName = "Ученик";
    public const string StudentId = "student";
    public const string DefaultColor = "#203F34";

    private static readonly Regex Latin = new("[A-Za-z\u00C6\u00E6]", RegexOptions.Compiled);
    private static readonly string[] Dialects = ["Iron", "Dval"];
    private static readonly char[] EndPunctuation = ['.', ',', '?', '!'];

    public static bool HasLatin(string? value) => value is not null && Latin.IsMatch(value);

    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var text = value.Normalize(NormalizationForm.FormC);
        var builder = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            builder.Append(ch switch
            {
                '\u00A0' or '\u202F' => ' ',
                '\u2018' or '\u2019' or '\u02BC' or '`' => '\'',
                '\u201C' or '\u201D' or '\u00AB' or '\u00BB' => '"',
                '\u2010' or '\u2011' or '\u2012' or '\u2013' or '\u2014' or '\u2212' => '-',
                _ => ch
            });
        }
        var collapsed = string.Join(' ', builder.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        collapsed = collapsed.TrimEnd(EndPunctuation);
        while (collapsed.Length > 1)
        {
            var last = collapsed[^1];
            if (last is not ('"' or '\'' or ')' or ']')) break;
            var opening = last switch { ')' => '(', ']' => '[', _ => last };
            if (!collapsed.StartsWith(opening)) break;
            collapsed = collapsed[1..^1].TrimEnd(EndPunctuation);
        }
        return collapsed.ToLowerInvariant();
    }

    public static (DialogueMaterial? Material, string[] Errors) Parse(string? title, string? dialect, int level,
        string? charactersText, string? linesText, string? turnsText)
    {
        var errors = new List<string>();
        title = (title ?? "").Trim();
        if (title.Length == 0) errors.Add("Диалог: укажите название.");
        else if (title.Length > 200) errors.Add("Диалог: название длиннее 200 символов.");
        if (HasLatin(title)) errors.Add("Диалог: в названии есть латинские буквы.");
        if (Array.IndexOf(Dialects, dialect) < 0) errors.Add("Диалог: выберите диалект.");
        if (level is < 1 or > 5) errors.Add("Диалог: уровень должен быть от 1 до 5.");

        var characters = ParseCharacters(charactersText, errors);
        var lines = ParseLines(linesText, characters, errors);
        var turns = ParseTurns(turnsText, lines, errors);
        ValidateScript(lines, turns, errors);

        var material = errors.Count == 0
            ? new DialogueMaterial(title, dialect ?? "Iron", level, characters.ToArray(), lines.ToArray(), turns.ToArray())
            : null;
        return (material, errors.ToArray());
    }

    private static List<DialogueCharacter> ParseCharacters(string? text, List<string> errors)
    {
        var characters = new List<DialogueCharacter>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var parts = raw.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length > 2) { errors.Add($"Персонажи, строка {index}: ожидается «Имя | #цвет»."); continue; }
            var name = parts[0].Trim();
            if (name.Length == 0) { errors.Add($"Персонажи, строка {index}: не указано имя."); continue; }
            if (name.Length > 100) { errors.Add($"Персонажи, строка {index}: имя длиннее 100 символов."); continue; }
            if (HasLatin(name)) { errors.Add($"Персонажи, строка {index}: латинские буквы недопустимы."); continue; }
            if (string.Equals(name, StudentName, StringComparison.OrdinalIgnoreCase))
            { errors.Add($"Персонажи, строка {index}: имя «{StudentName}» зарезервировано."); continue; }
            if (!names.Add(name)) { errors.Add($"Персонажи, строка {index}: имя «{name}» повторяется."); continue; }
            var color = parts.Length == 2 ? parts[1].Trim() : DefaultColor;
            if (color.Length == 0) color = DefaultColor;
            if (!Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$"))
            { errors.Add($"Персонажи, строка {index}: цвет должен быть в виде #RRGGBB."); continue; }
            characters.Add(new DialogueCharacter("p" + (characters.Count + 1), name, color));
        }
        if (characters.Count == 0) errors.Add("Персонажи: добавьте хотя бы одного собеседника.");
        return characters;
    }

    private static List<DialogueLine> ParseLines(string? text, List<DialogueCharacter> characters, List<string> errors)
    {
        var lines = new List<DialogueLine>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var separator = raw.IndexOf(':');
            if (separator < 0) { errors.Add($"Реплики, строка {index}: нет разделителя «:»."); continue; }
            var speaker = raw[..separator].Trim();
            var content = raw[(separator + 1)..].Trim();
            if (HasLatin(speaker) || HasLatin(content))
            { errors.Add($"Реплики, строка {index}: латинские буквы недопустимы."); continue; }
            if (content.Length > 500) { errors.Add($"Реплики, строка {index}: текст длиннее 500 символов."); continue; }
            string characterId;
            if (string.Equals(speaker, StudentName, StringComparison.OrdinalIgnoreCase))
            {
                characterId = StudentId;
            }
            else
            {
                var character = characters.FirstOrDefault(x => string.Equals(x.Name, speaker, StringComparison.OrdinalIgnoreCase));
                if (character is null) { errors.Add($"Реплики, строка {index}: неизвестный персонаж «{speaker}»."); continue; }
                if (content.Length == 0) { errors.Add($"Реплики, строка {index}: пустая реплика персонажа."); continue; }
                characterId = character.Id;
            }
            lines.Add(new DialogueLine(lines.Count + 1, characterId, content));
        }
        if (lines.Count is < 2 or > 200) errors.Add($"Диалог: нужно от 2 до 200 реплик, сейчас — {lines.Count}.");
        return lines;
    }

    private static List<DialogueTurn> ParseTurns(string? text, List<DialogueLine> lines, List<string> errors)
    {
        var turns = new List<DialogueTurn>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var parts = raw.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length != 6)
            {
                errors.Add($"Ходы, строка {index}: ожидается 6 полей через «|» — «№ | вид | эталоны | варианты | порог | пропуск».");
                continue;
            }
            if (!int.TryParse(parts[0], out var lineNumber))
            { errors.Add($"Ходы, строка {index}: номер реплики должен быть числом."); continue; }
            var kind = parts[1].ToLowerInvariant() switch { "choice" => "choice", "free" => "free", _ => "" };
            if (kind.Length == 0)
            { errors.Add($"Ходы, строка {index}: вид — только «choice» или «free»."); continue; }
            var references = parts[2].Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var options = parts[3].Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var threshold = 2;
            if (parts[4].Length > 0 && (!int.TryParse(parts[4], out threshold) || threshold < 1))
            { errors.Add($"Ходы, строка {index}: порог подсказки — целое число от 1."); continue; }
            var skippable = parts[5].ToLowerInvariant() is "да" or "yes" or "true";
            if (references.Any(HasLatin) || options.Any(HasLatin))
            { errors.Add($"Ходы, строка {index}: латинские буквы недопустимы."); continue; }
            if (references.Any(x => x.Length > 300)) { errors.Add($"Ходы, строка {index}: эталон длиннее 300 символов."); continue; }
            if (options.Any(x => x.Length > 200)) { errors.Add($"Ходы, строка {index}: вариант ответа длиннее 200 символов."); continue; }
            turns.Add(new DialogueTurn(lineNumber, kind, references, options, threshold, skippable));
        }
        return turns;
    }

    private static void ValidateScript(List<DialogueLine> lines, List<DialogueTurn> turns, List<string> errors)
    {
        if (turns.Count == 0) errors.Add("Диалог: добавьте хотя бы один ход.");
        if (turns.Count > 100) errors.Add($"Диалог: больше 100 ходов ({turns.Count}).");

        var byNumber = lines.ToDictionary(x => x.Number);
        var turnLines = new HashSet<int>();
        foreach (var turn in turns)
        {
            var label = $"Ход реплики {turn.LineNumber}";
            if (!byNumber.TryGetValue(turn.LineNumber, out var line))
            { errors.Add($"{label}: реплики с таким номером нет."); continue; }
            if (line.CharacterId != StudentId)
            { errors.Add($"{label}: ход можно привязать только к реплике ученика."); continue; }
            if (!turnLines.Add(turn.LineNumber))
            { errors.Add($"{label}: к одной реплике нельзя привязать два хода."); continue; }

            if (turn.Kind == "choice")
            {
                if (turn.Options.Length is < 2 or > 4) errors.Add($"{label}: у хода выбора от 2 до 4 вариантов, сейчас — {turn.Options.Length}.");
                if (turn.References.Length != 1) errors.Add($"{label}: у хода выбора ровно один эталон — текст верной кнопки.");
            }
            else
            {
                if (turn.Options.Length != 0) errors.Add($"{label}: у хода свободного ввода не должно быть вариантов ответа.");
                if (turn.References.Length is < 1 or > 3) errors.Add($"{label}: у хода ввода от 1 до 3 эталонных формулировок.");
            }
            if (turn.References.Any(string.IsNullOrWhiteSpace)) errors.Add($"{label}: эталонная формулировка не может быть пустой.");
            var referenceKeys = turn.References.Select(Normalize).Where(x => x.Length > 0).ToArray();
            if (referenceKeys.Distinct().Count() != referenceKeys.Length)
                errors.Add($"{label}: эталонные формулировки повторяются после приведения к сравнимому виду.");
            if (turn.Kind == "choice" && turn.References.Length == 1 && turn.Options.Length >= 2)
            {
                var key = Normalize(turn.References[0]);
                var optionKeys = turn.Options.Select(Normalize).ToArray();
                if (optionKeys.Count(x => x == key) != 1)
                    errors.Add($"{label}: ровно один вариант должен совпадать с эталоном — это верная кнопка.");
                if (optionKeys.Distinct().Count() != optionKeys.Length)
                    errors.Add($"{label}: варианты ответа повторяются после приведения к сравнимому виду.");
            }
        }

        foreach (var line in lines.Where(x => x.CharacterId == StudentId && !turnLines.Contains(x.Number)))
            errors.Add($"Реплика ученика {line.Number}: к ней не привязан ход.");
    }

    private static IEnumerable<string> Rows(string? text) =>
        (text ?? "").Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim()).Where(x => x.Length > 0);
}

public sealed class DialogueService(ICatalogRepository catalog, IProgressRepository progress)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex WordPattern = new(@"[\p{L}\p{M}]+", RegexOptions.Compiled);

    public async Task<DialogueConditionsView?> Conditions(Guid dialogueId, CancellationToken ct)
    {
        var dialogue = await catalog.Dialogue(dialogueId, ct);
        if (dialogue is null) return null;
        var material = Material(dialogue);
        return new DialogueConditionsView(dialogue.Id, material.Title, material.Dialect, material.Level,
            material.Characters.Select(x => new DialogueCharacterView(x.Id, x.Name, x.Color)).ToArray(),
            material.Lines.Select(line => LineView(line, material, line.CharacterId == DialogueScript.StudentId ? "" : line.Text)).ToArray(),
            material.Turns.Select(turn => TurnView(turn, 0)).ToArray());
    }

    public async Task<DialogueSessionView?> Start(Guid userId, Guid dialogueId, CancellationToken ct)
    {
        var dialogue = await catalog.Dialogue(dialogueId, ct);
        if (dialogue is null) return null;
        var session = await progress.ActiveSession(userId, dialogueId, ct);
        if (session is null)
        {
            var material = Material(dialogue);
            var (index, consumed) = Advance(material, 1);
            session = new DialogueSession
            {
                UserId = userId, DialogueId = dialogue.Id, DialogueVersion = dialogue.Version,
                DialogueTitle = dialogue.Title, ScriptJson = dialogue.ScriptJson,
                StateJson = Save(new DialogueState(index, consumed, 0))
            };
            await progress.CreateSession(session, ct);
        }
        return View(session);
    }

    public async Task<DialogueSessionView?> GetSession(Guid userId, Guid sessionId, CancellationToken ct)
    {
        var session = await progress.Session(userId, sessionId, ct);
        return session is null ? null : View(session);
    }

    public async Task<List<DialogueHistoryItem>> History(Guid userId, CancellationToken ct) =>
        (await progress.SessionHistory(userId, ct)).Select(x => new DialogueHistoryItem(x.Id,
            x.CompletedAt ?? x.StartedAt, x.DialogueTitle, x.TurnsCompleted, x.Errors, x.Hints)).ToList();

    public async Task<DialogueAnswerView?> Answer(Guid userId, Guid sessionId, DialogueAnswerInput input, CancellationToken ct)
    {
        var session = await progress.Session(userId, sessionId, ct);
        if (session is null) return null;
        if (session.CompletedAt is not null)
            return new DialogueAnswerView(false, null, [], null, Counters(session), true, Summary(session));

        var material = Material(session);
        var state = Load(session.StateJson);
        var line = material.Lines.SingleOrDefault(x => x.Number == state.Index);
        if (line is null)
        {
            await progress.SaveSessionState(userId, sessionId, Save(state), session.Attempts, session.Errors, session.Hints, session.TurnsCompleted, ct);
            await progress.CompleteSession(userId, sessionId, ct);
            return new DialogueAnswerView(false, null, [], null, Counters(session), true, Summary(session));
        }
        var turn = material.Turns.SingleOrDefault(x => x.LineNumber == line.Number)
            ?? throw new InvalidOperationException("Ход для текущей реплики не найден.");
        if (input.TurnId != line.Number) throw new ArgumentException("Ход устарел. Обновите страницу.");

        var log = state.Log.ToList();
        var added = new List<DialogueLineView>();
        var attempts = state.TurnAttempts;
        var totalAttempts = session.Attempts;
        var errors = session.Errors;
        var hints = session.Hints;
        var turns = session.TurnsCompleted;
        bool correct;
        DialogueHint? hint = null;

        if (input.Skip)
        {
            if (!turn.Skippable) throw new ArgumentException("Этот ход пропустить нельзя.");
            correct = true;
            log.Add(new DialogueLogEntry(line.Number, DialogueScript.StudentId, "Пропущено"));
            added.Add(LineView(line, material, "Пропущено"));
            turns++;
            attempts = 0;
        }
        else
        {
            var value = (input.Value ?? "").Trim();
            if (value.Length == 0) throw new ArgumentException("Введите ответ.");
            if (DialogueScript.HasLatin(value)) throw new ArgumentException("Переключите раскладку — в ответе есть латинские буквы.");
            totalAttempts++;
            attempts++;
            correct = turn.Kind == "choice"
                ? DialogueScript.Normalize(value) == DialogueScript.Normalize(turn.References[0])
                : turn.References.Any(x => DialogueScript.Normalize(x) == DialogueScript.Normalize(value));
            log.Add(new DialogueLogEntry(line.Number, DialogueScript.StudentId, value));
            added.Add(LineView(line, material, value));
            if (correct) { turns++; attempts = 0; }
            else
            {
                errors++;
                var stage = attempts < turn.HintThreshold ? 0 : attempts == turn.HintThreshold ? 1 : 2;
                if (stage > 0) { hints++; hint = BuildHint(turn, stage); }
            }
        }

        DialogueLogEntry[] consumed = [];
        var nextIndex = state.Index;
        if (correct)
        {
            (nextIndex, consumed) = Advance(material, line.Number + 1);
            foreach (var entry in consumed) { log.Add(entry); added.Add(LineView(material.Lines.Single(x => x.Number == entry.Line), material, entry.Text)); }
        }
        var finished = nextIndex > material.Lines.Max(x => x.Number);
        var newState = new DialogueState(nextIndex, log.ToArray(), attempts);
        await progress.SaveSessionState(userId, sessionId, Save(newState), totalAttempts, errors, hints, turns, ct);
        DialogueSummary? summary = null;
        DialogueTurnView? nextTurn = null;
        if (finished)
        {
            await progress.CompleteSession(userId, sessionId, ct);
            summary = new DialogueSummary(turns, errors, hints);
        }
        else
        {
            var nextLine = material.Lines.Single(x => x.Number == nextIndex);
            nextTurn = TurnView(material.Turns.Single(x => x.LineNumber == nextLine.Number), attempts);
        }
        return new DialogueAnswerView(correct, hint, added.ToArray(), nextTurn,
            new DialogueCounters(totalAttempts, errors, hints, turns), finished, summary);
    }

    private static DialogueSessionView View(DialogueSession session)
    {
        var material = Material(session);
        var state = Load(session.StateJson);
        var lines = state.Log.Select(entry => LineView(material.Lines.SingleOrDefault(x => x.Number == entry.Line) ?? new DialogueLine(entry.Line, entry.CharacterId, entry.Text), material, entry.Text)).ToArray();
        var finished = session.CompletedAt is not null;
        var currentLine = finished ? null : material.Lines.SingleOrDefault(x => x.Number == state.Index);
        var turn = currentLine is null ? null : material.Turns.SingleOrDefault(x => x.LineNumber == currentLine.Number);
        return new DialogueSessionView(session.Id, session.DialogueId, session.DialogueVersion, session.DialogueTitle,
            finished, lines, turn is null ? null : TurnView(turn, state.TurnAttempts), Counters(session),
            finished ? Summary(session) : null);
    }

    private static (int Index, DialogueLogEntry[] Consumed) Advance(DialogueMaterial material, int fromNumber)
    {
        var consumed = new List<DialogueLogEntry>();
        var number = fromNumber;
        while (true)
        {
            var line = material.Lines.SingleOrDefault(x => x.Number == number);
            if (line is null || line.CharacterId == DialogueScript.StudentId) break;
            consumed.Add(new DialogueLogEntry(line.Number, line.CharacterId, line.Text));
            number++;
        }
        return (number, consumed.ToArray());
    }

    private static DialogueLineView LineView(DialogueLine line, DialogueMaterial material, string text)
    {
        if (line.CharacterId == DialogueScript.StudentId)
            return new DialogueLineView(line.Number, line.CharacterId, "", "", text, "student", []);
        var character = material.Characters.FirstOrDefault(x => x.Id == line.CharacterId);
        return new DialogueLineView(line.Number, line.CharacterId, character?.Name ?? "?", character?.Color ?? DialogueScript.DefaultColor,
            text, "npc", WordPattern.Matches(text).Select(x => new DialogueWord(x.Value, x.Index)).ToArray());
    }

    private static DialogueTurnView TurnView(DialogueTurn turn, int attempts) =>
        new(turn.LineNumber, turn.Kind, turn.Options, turn.Skippable, attempts);

    private static DialogueHint BuildHint(DialogueTurn turn, int stage)
    {
        if (turn.Kind == "choice")
        {
            var reference = DialogueScript.Normalize(turn.References[0]);
            var correctIndex = Array.FindIndex(turn.Options, x => DialogueScript.Normalize(x) == reference);
            return new DialogueHint(stage, null, stage >= 2 ? turn.References[0] : null, correctIndex);
        }
        var expected = turn.References[0];
        if (stage == 1)
        {
            var length = Math.Min(Math.Max(1, (expected.Length + 1) / 2), Math.Max(1, expected.Length - 1));
            var prefix = expected[..length];
            var space = prefix.LastIndexOf(' ');
            if (space > 0) prefix = prefix[..space];
            return new DialogueHint(1, prefix, null, null);
        }
        return new DialogueHint(2, null, expected, null);
    }

    private static DialogueMaterial Material(Dialogue dialogue) => Material(dialogue.ScriptJson);
    private static DialogueMaterial Material(DialogueSession session) => Material(session.ScriptJson);
    private static DialogueMaterial Material(string json) =>
        JsonSerializer.Deserialize<DialogueMaterial>(json, JsonOptions) ?? throw new InvalidOperationException("Скрипт диалога не читается.");

    private static DialogueState Load(string json) => JsonSerializer.Deserialize<DialogueState>(json, JsonOptions) is { } state && state.Log is not null
        ? state : new DialogueState(1, [], 0);
    private static string Save(DialogueState state) => JsonSerializer.Serialize(state, JsonOptions);
    private static DialogueCounters Counters(DialogueSession session) => new(session.Attempts, session.Errors, session.Hints, session.TurnsCompleted);
    private static DialogueSummary Summary(DialogueSession session) => new(session.TurnsCompleted, session.Errors, session.Hints);
}
