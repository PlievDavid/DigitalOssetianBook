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
        Mode = payload.Mode, CorrectWord = payload.Word,
        Options = payload.Mode == PictureScript.ChoiceMode ? PictureService.Shuffle([payload.Word, .. payload.Distractors]) : []
    };

    private static GrammarService.GrammarState Grammar(EditorMaterial material, GrammarMaterial payload) => new()
    {
        MaterialId = material.Id, Version = material.Version, Title = payload.Title,
        Prompt = payload.Prompt, Blank = payload.Blank, CorrectForm = payload.Correct, Rule = payload.Rule,
        Options = PictureService.Shuffle([payload.Correct, .. payload.Distractors])
    };

    internal static object View(string kind, CoursePracticeRun run, string? media = null)
    {
        object board;
        switch (kind)
        {
            case "matching":
                board = MatchingService.Board(run.Id, Read<MatchingService.MatchingState>(run.StateJson), []);
                break;
            case "picture":
                var picture = Read<PictureService.PictureState>(run.StateJson);
                board = new { picturePath = media ?? picture.PicturePath, picture.Mode, picture.Options };
                break;
            case "grammar":
                var grammar = Read<GrammarService.GrammarState>(run.StateJson);
                board = new { grammar.Prompt, grammar.Blank, grammar.Options, hint = grammar.Attempts > 0 ? grammar.Rule : null };
                break;
            case "dialogue":
                board = DialogueService.View(Read<DialogueSession>(run.StateJson));
                break;
            default: throw new ArgumentException("Тип упражнения недоступен.");
        }
        return new { run.Revision, run.Complete, board };
    }

    internal static async Task<(object Reply, bool Correct)> Answer(string kind, CoursePracticeRun run, CoursePracticeInput input)
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
                return (new { correct, expected = picture.CorrectWord }, correct);
            case "grammar" when input.Choice is { } choice:
                var grammar = Read<GrammarService.GrammarState>(run.StateJson);
                var accepted = GrammarService.CheckChoice(grammar, choice.Index);
                grammar.Attempts++;
                run.Complete = accepted;
                run.StateJson = JsonSerializer.Serialize(grammar, Json);
                return (new { correct = accepted, hint = grammar.Rule, expected = accepted || grammar.Attempts >= 2 ? grammar.CorrectForm : null }, accepted);
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
