using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public static class DialogueDictionary
{
    public static DialogueLineView[] WithMatches(DialogueLineView[] lines, IReadOnlyDictionary<string, DictionaryMatch[]> byKey)
    {
        return (lines ?? []).Select(line => line with
        {
            Words = (line.Words ?? [])
                .Select(word => word with { Matches = byKey.GetValueOrDefault(DictionaryService.Key(word.Text), []) })
                .ToArray()
        }).ToArray();
    }

    public static DialogueMeaningView[] Meanings(IReadOnlyList<DictionarySense> senses) =>
        senses.Select(x => new DialogueMeaningView(x.Id, x.Ossetian, x.Russian, x.RussianHeadword, x.Note ?? "")).ToArray();

    public static Guid[] SenseIds(IEnumerable<DialogueLineView> lines) =>
        lines.SelectMany(line => line.Words)
            .SelectMany(word => word.Matches)
            .Select(match => match.SenseId)
            .Distinct()
            .ToArray();
}