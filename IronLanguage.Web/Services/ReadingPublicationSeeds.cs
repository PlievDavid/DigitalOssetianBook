using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed record ReadingPublicationSeed(string Slug, string PreviousTranslation, string Translation);

public static class ReadingPublicationSeeds
{
    public static ReadingPublicationItem[] Read(string directory)
    {
        var drafts = ReadingDraftCatalog.Read(Path.Combine(directory, "drafts.json"));
        var seeds = JsonSerializer.Deserialize<ReadingPublicationSeed[]>(File.ReadAllText(Path.Combine(directory, "published-seeds.json")),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? [];
        if (!seeds.Select(seed => seed.Slug).Order().SequenceEqual(new[] { "mischief", "schoolboy", "testament" }))
            throw new InvalidDataException("Сиды должны содержать Школьника, Шалуна и Завещание без повторов.");
        return seeds.Select(seed =>
        {
            var draft = drafts.Single(draft => draft.Slug == seed.Slug);
            if (string.IsNullOrWhiteSpace(seed.Translation) || seed.Translation.Contains('⚠') || seed.Translation.Length > 50000
                || seed.Translation.Contains('\r') || seed.Translation.Split('\n').Length != draft.Original.Split('\n').Length
                || draft.Original.Split('\n').Where((line, index) => string.IsNullOrWhiteSpace(line)
                    != string.IsNullOrWhiteSpace(seed.Translation.Split('\n')[index])).Any())
                throw new InvalidDataException($"Проверьте перевод и построчность «{draft.Title}».");
            var material = ReadingSeedService.Build(draft).Material;
            return new ReadingPublicationItem(ReadingSeedService.StableId(seed.Slug), material with
            {
                Description = "Стихотворение Коста Хетагурова с подстрочным переводом.", CoverImagePath = null,
                Chapters = [material.Chapters[0] with { Translation = seed.Translation }], TranslationReviewed = true,
                CoverDesign = BookCoverDesign.ForTitle(draft.Title)
            }, seed.PreviousTranslation);
        }).ToArray();
    }
}
