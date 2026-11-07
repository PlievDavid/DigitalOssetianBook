namespace IronLanguage.Db;

public static class BookTranslationReview
{
    public static bool HasWarnings(BookMaterial material) => material.LiteraryTranslation.Contains('⚠')
        || material.Chapters.Any(chapter => chapter.Translation?.Contains('⚠') == true);

    public static BookMaterial Approve(BookMaterial material) => material with { TranslationReviewed = true };
}
