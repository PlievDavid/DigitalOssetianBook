using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed record CoursePracticeInput(Guid BlockId, int Revision, CoursePairInput? Pair, CourseChoiceInput? Choice, DialogueAnswerInput? Dialogue);
public sealed record CoursePairInput(int Left, int Right);
public sealed record CourseChoiceInput(int? Index, string? Text);

internal static class CoursePractice
{
    private static readonly JsonSerializerOptions Json = CourseAuthoringService.JsonOptions;
    internal static bool Supports(string kind) => kind is "matching" or "picture" or "grammar" or "dialogue";

    private static T Read<T>(string value) => JsonSerializer.Deserialize<T>(value, Json)
        ?? throw new ArgumentException("Упражнение повреждено.");

    internal static CoursePracticeRun Create(EditorMaterial material, Guid user)
    {
        object state = material.Kind switch
        {
            "matching" => MatchingService.CreateState(material.Id, material.Version, Read<MatchingMaterial>(material.PayloadJson)),
            "picture" => Picture(material, Read<PictureMaterial>(material.PayloadJson)),
            "grammar" => Grammar(material, Read<GrammarMaterial>(material.PayloadJson)),
            "dialogue" => DialogueService.CreateSnapshot(new Dialogue { Id = material.Id, Version = material.Version,
                Title = Read<DialogueMaterial>(material.PayloadJson).Title, ScriptJson = material.PayloadJson }, user),
            _ => throw new ArgumentException("Тип упражнения недоступен.")
        };
        return new CoursePracticeRun { UserId = user, StateJson = JsonSerializer.Serialize(state, Json) };
    }

    private static PictureService.PictureState Picture(EditorMaterial material, PictureMaterial payload) => new()
    {
        MaterialId = material.Id, Version = material.Version, Title = payload.Title, PicturePath = payload.PicturePath,
        Mode = payload.Mode, CorrectWord = payload.Word, WordIds = payload.WordIds,
        Options = payload.Mode == PictureScript.ChoiceMode ? PictureService.Shuffle([payload.Word, .. payload.Distractors]) : []
    };

    private static GrammarService.GrammarState Grammar(EditorMaterial material, GrammarMaterial payload) => new()
    {
        MaterialId = material.Id, Version = material.Version, Title = payload.Title,
        Prompt = payload.Prompt, Blank = payload.Blank, CorrectForm = payload.Correct, Rule = payload.Rule, WordIds = payload.WordIds,
        Options = PictureService.Shuffle([payload.Correct, .. payload.Distractors])
    };

    internal static async Task<object> View(string kind, CoursePracticeRun run, EditorMaterial? material,
        ICatalogRepository? catalog, string media, CancellationToken ct)
    {
        object board;
        switch (kind)
        {
            case "matching":
                var matching = Read<MatchingService.MatchingState>(run.StateJson);
                var wordIds = material is null ? [] : Read<MatchingMaterial>(material.PayloadJson).WordIds;
                var words = await Words(catalog, wordIds, ct);
                var match = MatchingService.Board(run.Id, matching, [.. words.Select(word => new MatchingWord(word.Id, word.Ossetian, word.Russian))]);
                board = new { match.SessionId, match.MaterialId, match.Version, match.Title, match.Left, match.Right,
                    match.Matched, match.Total, match.Finished, match.Words, matching.MatchedByLeft };
                break;
            case "picture":
                var picture = Read<PictureService.PictureState>(run.StateJson);
                board = new { picturePath = media, picture.Mode, picture.Options, picture.Title, answered = run.Complete, correct = run.Complete,
                    correctWord = run.Complete ? picture.CorrectWord : null, words = run.Complete ? await Words(catalog, PictureWords(material, picture), ct) : [] };
                break;
            case "grammar":
                var grammar = Read<GrammarService.GrammarState>(run.StateJson);
                board = new { grammar.Title, grammar.Prompt, grammar.Blank, grammar.Options, grammar.Attempts,
                    answered = run.Complete, correct = run.Complete, showRule = grammar.Attempts > 0,
                    rule = grammar.Attempts > 0 ? grammar.Rule : null, correctForm = run.Complete ? grammar.CorrectForm : null,
                    words = run.Complete ? await Words(catalog, GrammarWords(material, grammar), ct) : [],
                    sentence = GrammarService.Tokenize(grammar.Prompt, grammar.Blank, run.Complete ? grammar.CorrectForm : null) };
                break;
            case "dialogue":
                board = DialogueService.View(Read<DialogueSession>(run.StateJson));
                break;
            default: throw new ArgumentException("Тип упражнения недоступен.");
        }
        return new { run.Revision, run.Complete, board };
    }

    private static async Task<ExerciseWord[]> Words(ICatalogRepository? catalog, Guid[] ids, CancellationToken ct)
    {
        if (catalog is null || ids.Length == 0) return [];
        var words = await catalog.WordsByIds(ids, ct);
        return [.. words.Select(word => new ExerciseWord(word.Id, word.Ossetian, word.Russian))];
    }

    private static Guid[] PictureWords(EditorMaterial? material, PictureService.PictureState state) =>
        material is null ? state.WordIds : Read<PictureMaterial>(material.PayloadJson).WordIds;

    private static Guid[] GrammarWords(EditorMaterial? material, GrammarService.GrammarState state) =>
        material is null ? state.WordIds : Read<GrammarMaterial>(material.PayloadJson).WordIds;

    internal static async Task<(object Reply, bool Correct)> Answer(string kind, CoursePracticeRun run, CoursePracticeInput input,
        EditorMaterial? material, ICatalogRepository? catalog, CancellationToken ct)
    {
        switch (kind)
        {
            case "matching" when input.Pair is { } pair:
                var matching = Read<MatchingService.MatchingState>(run.StateJson);
                var match = MatchingService.CheckState(matching, pair.Left, pair.Right);
                run.Complete = match.Finished;
                run.StateJson = JsonSerializer.Serialize(matching, Json);
                return (match, match.Correct);
            case "picture" when input.Choice is { } option:
                var picture = Read<PictureService.PictureState>(run.StateJson);
                var correct = picture.Mode == PictureScript.ChoiceMode
                    ? PictureService.CheckChoice(picture, option.Index) : PictureService.CheckFree(picture, option.Text);
                run.Complete = correct;
                return (new { correct, correctWord = picture.CorrectWord, finished = true,
                    words = await Words(catalog, PictureWords(material, picture), ct) }, correct);
            case "grammar" when input.Choice is { } choice:
                var grammar = Read<GrammarService.GrammarState>(run.StateJson);
                var accepted = GrammarService.CheckChoice(grammar, choice.Index);
                grammar.Attempts++;
                run.Complete = accepted;
                var finished = accepted || grammar.Attempts >= 2;
                var grammarReply = new { correct = accepted, finished, grammar.Attempts, showRule = true,
                    grammar.Rule, correctForm = finished ? grammar.CorrectForm : null,
                    sentence = GrammarService.Tokenize(grammar.Prompt, grammar.Blank, finished ? grammar.CorrectForm : null),
                    words = finished ? await Words(catalog, GrammarWords(material, grammar), ct) : [] };
                if (finished && !accepted) grammar.Attempts = 0;
                run.StateJson = JsonSerializer.Serialize(grammar, Json);
                return (grammarReply, accepted);
            case "dialogue" when input.Dialogue is { } dialogueInput:
                var dialogue = Read<DialogueSession>(run.StateJson);
                var reply = await DialogueService.AnswerSnapshot(dialogue, dialogueInput);
                run.Complete = reply.Finished;
                run.StateJson = JsonSerializer.Serialize(dialogue, Json);
                return (reply, reply.Correct);
            default: throw new ArgumentException("Выберите ответ для этого упражнения.");
        }
    }
}
