using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

// The initial authoring contract supports theory. Exercise adapters are added separately;
// unsupported blocks must never be silently published as theory.
public sealed record CourseDraft(string Title, string Description, CourseDraftModule[] Modules)
{
    public string? CoverPath { get; init; }
    public string Theme { get; init; } = "sage";
    public JsonElement? DescriptionRichText { get; init; }
    public string Level { get; init; } = "Начальный";
    public string Outcomes { get; init; } = "";
    public bool Sequential { get; init; }
}
public sealed record CourseDraftModule(Guid Id, string Title, CourseDraftLesson[] Lessons);
public sealed record CourseDraftLesson(Guid Id, string Title, CourseDraftBlock[] Blocks);
public sealed record CourseDraftBlock(Guid Id, string Kind, string Title, string Text)
{
    public Guid? MaterialId { get; init; }
    public Exercise? PublishedExercise { get; init; }
    public JsonElement? RichText { get; init; }
}

public sealed class CourseAuthoringService(ICourseRepository courses, ICatalogRepository? catalog = null)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void Validate(CourseDraft draft, bool publishing)
    {
        if (draft.Theme is not ("sage" or "sky" or "sand") || draft.CoverPath is not null && !System.Text.RegularExpressions.Regex.IsMatch(draft.CoverPath, @"^/media/course-covers/[a-f0-9]{32}\.(png|jpg|jpeg|webp)$")) throw new ArgumentException("Проверьте обложку и оформление курса.");
        if (draft.Level is not ("Начальный" or "Средний" or "Продвинутый") || draft.Outcomes is null || draft.Outcomes.Length > 3000)
            throw new ArgumentException("Проверьте уровень и результаты обучения (до 3000 символов).");
        if (string.IsNullOrWhiteSpace(draft.Title) || draft.Title.Length > 150)
            throw new ArgumentException("Укажите название до 150 символов.");
        var description = CourseRichText.PlainText(new CourseDraftBlock(Guid.Empty, "theory", "", draft.Description) { RichText = draft.DescriptionRichText });
        if (description is null || description.Length > 10_000 || publishing && string.IsNullOrWhiteSpace(description)) throw new ArgumentException("Заполните описание до 10 000 символов.");
        if (draft.Description is null || draft.Description.Length > 10_000 || publishing && string.IsNullOrWhiteSpace(draft.Description))
            throw new ArgumentException("Для публикации нужно описание до 10 000 символов.");
        if (draft.Modules is null || draft.Modules.Length > 50 || publishing && draft.Modules.Length == 0)
            throw new ArgumentException("Добавьте от 1 до 50 модулей.");
        var ids = new HashSet<Guid>();
        void Identity(Guid id, string title)
        {
            if (id == Guid.Empty || !ids.Add(id)) throw new ArgumentException("У элементов должны быть разные постоянные идентификаторы.");
            if (string.IsNullOrWhiteSpace(title) || title.Length > 150) throw new ArgumentException("Название элемента: от 1 до 150 символов.");
        }
        foreach (var module in draft.Modules)
        {
            if (module is null) throw new ArgumentException("Пустой модуль.");
            Identity(module.Id, module.Title);
            if (module.Lessons is null || module.Lessons.Length > 50 || publishing && module.Lessons.Length == 0)
                throw new ArgumentException("В модуле должно быть от 1 до 50 уроков.");
            foreach (var lesson in module.Lessons)
            {
                if (lesson is null) throw new ArgumentException("Пустой урок.");
                Identity(lesson.Id, lesson.Title);
                if (lesson.Blocks is null || lesson.Blocks.Length > 100 || publishing && lesson.Blocks.Length == 0)
                    throw new ArgumentException("В уроке должно быть от 1 до 100 блоков.");
                foreach (var block in lesson.Blocks)
                {
                    if (block is null) throw new ArgumentException("Пустой блок.");
                    Identity(block.Id, block.Title);
                    if (block.Kind is not ("theory" or "translation")) throw new ArgumentException("Этот тип блока ещё не поддерживается новой системой курсов.");
                    if (block.Kind == "translation" && (block.MaterialId is null || block.MaterialId == Guid.Empty))
                        throw new ArgumentException("Выберите упражнение «Собери фразу».");
                    var text = CourseRichText.PlainText(block);
                    if (text is null || text.Length > 20_000 || publishing && block.Kind == "theory" && string.IsNullOrWhiteSpace(text))
                        throw new ArgumentException("Заполните текст теории (до 20 000 символов).");
                }
            }
        }
    }

    public Task<Course> Create(Guid owner, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        return courses.Create(owner, JsonSerializer.Serialize(WithoutSnapshots(draft), JsonOptions), ct);
    }

    public Task<Course?> Save(Guid id, Guid owner, long stamp, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        return courses.Save(id, owner, stamp, JsonSerializer.Serialize(WithoutSnapshots(draft), JsonOptions), ct);
    }

    public async Task<CourseVersion?> Publish(Guid id, Guid owner, long stamp, bool reviewed, CancellationToken ct)
    {
        if (!reviewed) throw new ArgumentException("Подтвердите проверку содержания и прав на материалы.");
        var course = await courses.Owned(id, owner, ct);
        if (course is null || course.DraftStamp != stamp) return null;
        var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, JsonOptions)
            ?? throw new ArgumentException("Не удалось прочитать черновик.");
        Validate(draft, true);
        draft = WithoutSnapshots(draft);
        var modules = new List<CourseDraftModule>();
        foreach (var module in draft.Modules)
        {
            var lessons = new List<CourseDraftLesson>();
            foreach (var lesson in module.Lessons)
            {
                var blocks = new List<CourseDraftBlock>();
                foreach (var block in lesson.Blocks)
                {
                    if (block.Kind == "theory") { blocks.Add(block); continue; }
                    var exercise = catalog is null ? null : await catalog.Exercise(block.MaterialId!.Value, ct: ct);
                    if (exercise is null || exercise.Kind != block.Kind)
                        throw new ArgumentException($"В уроке «{lesson.Title}» выберите доступное опубликованное упражнение.");
                    blocks.Add(block with { PublishedExercise = exercise });
                }
                lessons.Add(lesson with { Blocks = blocks.ToArray() });
            }
            modules.Add(module with { Lessons = lessons.ToArray() });
        }
        return await courses.Publish(id, owner, stamp, JsonSerializer.Serialize(draft with { Modules = modules.ToArray() }, JsonOptions), ct);
    }

    private static CourseDraft WithoutSnapshots(CourseDraft draft) => draft with { Description = CourseRichText.PlainText(new CourseDraftBlock(Guid.Empty, "theory", "", draft.Description) { RichText = draft.DescriptionRichText }), Modules = draft.Modules.Select(m => m with {
        Lessons = m.Lessons.Select(l => l with { Blocks = l.Blocks.Select(b => b with { PublishedExercise = null, Text = CourseRichText.PlainText(b) }).ToArray() }).ToArray()
    }).ToArray() };
}
