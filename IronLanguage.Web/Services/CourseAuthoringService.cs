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
public sealed record CourseDraftLesson(Guid Id, string Title, CourseDraftBlock[] Blocks)
{
    public Guid? LibraryVersionId { get; init; }
}
public sealed record CourseDraftBlock(Guid Id, string Kind, string Title, string Text)
{
    public Guid? MaterialId { get; init; }
    public Exercise? PublishedExercise { get; init; }
    public EditorMaterial? PublishedActivity { get; init; }
    public JsonElement? RichText { get; init; }
    public CourseTheoryMedia? TheoryMedia { get; init; }
}
public sealed record CoursePublicationIssue(string Message, Guid? LessonId = null, Guid? BlockId = null);

public sealed class CourseAuthoringService(ICourseRepository courses, ICourseMaterialRepository? materials = null, ICourseLearningRepository? publications = null,
    IEditorRepository? editor = null, ILessonLibraryRepository? library = null, IWebHostEnvironment? environment = null,
    CourseTheoryMediaStore? theoryMedia = null)
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
                    if (block.Kind != "theory" && !EfCourseMaterialRepository.Supports(block.Kind)) throw new ArgumentException("Этот тип блока ещё не поддерживается новой системой курсов.");
                    if (publishing && block.Kind != "theory" && (block.MaterialId is null || block.MaterialId == Guid.Empty))
                        throw new ArgumentException("Выберите упражнение из библиотеки.");
                    var text = CourseRichText.PlainText(block);
                    if (text is null || text.Length > 20_000)
                        throw new ArgumentException("Текст теории должен содержать не более 20 000 символов.");
                    if (publishing && block.Kind == "theory" && block.TheoryMedia is null && string.IsNullOrWhiteSpace(text))
                        throw new ArgumentException("Добавьте текст, фото или видео.");
                    if (block.TheoryMedia is { } media)
                    {
                        if (block.Kind != "theory" || !CourseTheoryMediaStore.ValidName(media.File) ||
                            media.Caption is null || media.Caption.Length > 300 || media.Alt is null || media.Alt.Length > 300)
                            throw new ArgumentException("Проверьте вложение, подпись и описание изображения.");
                        if (publishing && !CourseTheoryMediaStore.IsVideo(media.File) && string.IsNullOrWhiteSpace(media.Alt))
                            throw new ArgumentException("Добавьте описание изображения.");
                    }
                }
            }
        }
    }

    public async Task<Course> Create(Guid owner, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        CheckTheoryFiles(draft, owner);
        await CheckLinks(draft, owner, ct);
        await CheckMaterials(draft, owner, [], ct);
        return await courses.Create(owner, JsonSerializer.Serialize(WithoutSnapshots(draft), JsonOptions), ct);
    }

    public async Task<Course?> Save(Guid id, Guid owner, long stamp, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        var course = await courses.Owned(id, owner, ct);
        if (course is null || course.DraftStamp != stamp) return null;
        CheckTheoryFiles(draft, owner);
        await CheckLinks(draft, owner, ct);
        await CheckMaterials(draft, owner, await PublishedBlocks(course, ct), ct);
        return await courses.Save(id, owner, stamp, JsonSerializer.Serialize(WithoutSnapshots(draft), JsonOptions), ct);
    }

    public static CourseDraftLesson Include(LibraryLesson source, Guid inclusion)
    {
        var original = JsonSerializer.Deserialize<CourseDraftLesson>(source.LessonJson, JsonOptions)!;
        Guid InclusionBlock(Guid block)
        {
            var bytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{inclusion:D}/{block:D}"));
            return new Guid(bytes.AsSpan(0, 16));
        }
        return original with { Id = inclusion, LibraryVersionId = source.Id,
            Blocks = original.Blocks.Select(b => b with { Id = InclusionBlock(b.Id), PublishedActivity = null, PublishedExercise = null }).ToArray() };
    }

    private async Task CheckLinks(CourseDraft draft, Guid owner, CancellationToken ct)
    {
        var links = draft.Modules.SelectMany(m => m.Lessons).Where(l => l.LibraryVersionId.HasValue).ToArray();
        if (links.Length == 0) return;
        if (library is null) throw new ArgumentException("Библиотека уроков недоступна.");
        var sources = (await library.Owned(owner, ct)).ToDictionary(x => x.Id);
        foreach (var lesson in links)
        {
            if (!sources.TryGetValue(lesson.LibraryVersionId!.Value, out var source) ||
                JsonSerializer.Serialize(Include(source, lesson.Id), JsonOptions) != JsonSerializer.Serialize(lesson, JsonOptions))
                throw new ArgumentException($"Связанный урок «{lesson.Title}» изменён. Отделите копию или обновите его из библиотеки.");
        }
    }

    private async Task<Dictionary<Guid, CourseDraftBlock>> PublishedBlocks(Course course, CancellationToken ct) =>
        course.PublishedVersionId is Guid version && publications is not null && await publications.Snapshot(version, ct) is { } published
            ? CourseLearningService.Read(published).Modules.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks).ToDictionary(b => b.Id)
            : [];

    private static CourseDraftBlock? Previous(CourseDraftBlock block, Dictionary<Guid, CourseDraftBlock> published) =>
        published.TryGetValue(block.Id, out var previous) && previous.Kind == block.Kind && previous.MaterialId == block.MaterialId ? previous : null;

    private async Task CheckMaterials(CourseDraft draft, Guid owner, Dictionary<Guid, CourseDraftBlock> published, CancellationToken ct)
    {
        foreach (var block in draft.Modules.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks))
        {
            if (block.Kind == "theory" || block.MaterialId is not Guid id) continue;
            if (Previous(block, published) is not null) continue;
            if (materials is null || !await materials.Available(owner, block.Kind, id, ct))
                throw new ArgumentException($"Упражнение в блоке «{block.Title}» недоступно. Выберите материал из библиотеки.");
        }
    }

    public async Task<CourseVersion?> Publish(Guid id, Guid owner, long stamp, bool reviewed, CancellationToken ct)
    {
        if (!reviewed) throw new ArgumentException("Подтвердите проверку содержания и прав на материалы.");
        var course = await courses.Owned(id, owner, ct);
        if (course is null || course.DraftStamp != stamp) return null;
        var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, JsonOptions)
            ?? throw new ArgumentException("Не удалось прочитать черновик.");
        Validate(draft, true);
        CheckFile(draft.CoverPath, "Обложка курса", required: false);
        await CheckLinks(draft, owner, ct);
        draft = await Resolve(course, draft, ct);
        return await courses.Publish(id, owner, stamp, JsonSerializer.Serialize(draft, JsonOptions), ct);
    }

    public async Task<CoursePublicationIssue[]> PublicationIssues(Course course, CancellationToken ct)
    {
        var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, JsonOptions)!;
        var issues = new List<CoursePublicationIssue>();
        var published = await PublishedBlocks(course, ct);
        var placeholder = new CourseDraftModule(Guid.NewGuid(), "Проверка", [new(Guid.NewGuid(), "Проверка", [new(Guid.NewGuid(), "theory", "Проверка", "Проверка")])]);
        try { Validate(draft with { Modules = [placeholder] }, true); CheckFile(draft.CoverPath, "Обложка курса", required: false); }
        catch (ArgumentException error) { issues.Add(new(error.Message)); }
        if (draft.Modules.Length == 0) issues.Add(new("Добавьте хотя бы один модуль."));
        foreach (var module in draft.Modules)
        {
            if (module.Lessons.Length == 0) issues.Add(new($"Добавьте урок в модуль «{module.Title}»."));
            foreach (var lesson in module.Lessons)
            {
                if (lesson.Blocks.Length == 0) issues.Add(new($"Добавьте блоки в урок «{lesson.Title}».", lesson.Id));
                foreach (var block in lesson.Blocks)
                {
                    var single = draft with { Title = "Проверка", Description = "Проверка", DescriptionRichText = null,
                        Modules = [module with { Lessons = [lesson with { Blocks = [block] }] }] };
                    try
                    {
                        Validate(single, true);
                        await ResolveBlock(block, course.OwnerId, published, ct);
                    }
                    catch (ArgumentException error) { issues.Add(new(error.Message, lesson.Id, block.Id)); }
                }
            }
        }
        try { await CheckLinks(draft, course.OwnerId, ct); }
        catch (ArgumentException error) { issues.Add(new(error.Message)); }
        return issues.Distinct().ToArray();
    }

    public async Task<CourseDraft> Resolve(Course course, CourseDraft draft, CancellationToken ct)
    {
        draft = WithoutSnapshots(draft);
        var published = await PublishedBlocks(course, ct);
        var modules = new List<CourseDraftModule>();
        foreach (var module in draft.Modules)
        {
            var lessons = new List<CourseDraftLesson>();
            foreach (var lesson in module.Lessons)
            {
                var blocks = new List<CourseDraftBlock>();
                foreach (var block in lesson.Blocks)
                    blocks.Add(await ResolveBlock(block, course.OwnerId, published, ct));
                lessons.Add(lesson with { Blocks = blocks.ToArray() });
            }
            modules.Add(module with { Lessons = lessons.ToArray() });
        }
        return draft with { Modules = modules.ToArray() };
    }

    private async Task<CourseDraftBlock> ResolveBlock(CourseDraftBlock block, Guid owner, Dictionary<Guid, CourseDraftBlock> published, CancellationToken ct)
    {
        if (block.Kind == "theory")
        {
            CheckTheoryFile(block, owner);
            return block;
        }
        var materialId = block.MaterialId!.Value;
        var previous = Previous(block, published);
        var unavailable = $"В блоке «{block.Title}» выберите доступное опубликованное упражнение.";
        if (CoursePractice.Supports(block.Kind))
        {
            var available = materials is not null && await materials.Available(owner, block.Kind, materialId, ct);
            var activity = available && editor is not null ? await editor.Material(block.Kind, materialId, ct) : null;
            if (activity is null && previous?.PublishedActivity is { } stored &&
                materials is not null && (await materials.Access(block.Kind, materialId, ct))?.Blocked != true)
                activity = stored;
            if (activity is not { Published: true }) throw new ArgumentException(unavailable);
            if (block.Kind == "picture")
            {
                var picture = JsonSerializer.Deserialize<PictureMaterial>(activity.PayloadJson, JsonOptions);
                CheckFile(picture?.PicturePath, $"Изображение блока «{block.Title}»", required: true);
            }
            return block with { PublishedActivity = activity };
        }
        var exercise = materials is null ? null : await materials.Exercise(owner, block.Kind, materialId, ct);
        if (exercise is null && previous?.PublishedExercise is { } storedExercise &&
            materials is not null && (await materials.Access(block.Kind, materialId, ct))?.Blocked != true)
            exercise = storedExercise;
        if (exercise is null || exercise.Kind != block.Kind) throw new ArgumentException(unavailable);
        CheckFile(exercise.AudioPath, $"Запись блока «{block.Title}»", required: exercise.Kind is "audio" or "listening");
        return block with { PublishedExercise = exercise };
    }

    private void CheckTheoryFiles(CourseDraft draft, Guid owner)
    {
        foreach (var block in draft.Modules.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks))
            CheckTheoryFile(block, owner);
    }

    private void CheckTheoryFile(CourseDraftBlock block, Guid owner)
    {
        if (block.TheoryMedia is { } media && theoryMedia?.Exists(owner, media.File) != true)
            throw new ArgumentException($"Вложение блока «{block.Title}» недоступно. Замените или удалите файл.");
    }

    private void CheckFile(string? path, string label, bool required)
    {
        if (path is null && !required) return;
        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("/media/", StringComparison.Ordinal) ||
            path.Contains('\\') || path.Split('/').Any(part => part is "." or ".."))
            throw new ArgumentException($"{label} недоступна. Выберите или загрузите файл заново.");
        if (environment is not null && environment.WebRootFileProvider.GetFileInfo(path.TrimStart('/')) is not { Exists: true, IsDirectory: false })
            throw new ArgumentException($"{label} недоступна. Выберите или загрузите файл заново.");
    }

    public Task<Course?> Restore(Guid id, Guid owner, long stamp, CourseVersion version, CancellationToken ct) =>
        courses.Save(id, owner, stamp, JsonSerializer.Serialize(WithoutSnapshots(CourseLearningService.Read(version)), JsonOptions), ct);

    public static object VersionSummary(CourseVersion version, CourseVersion? previous)
    {
        static Dictionary<Guid, string> Elements(CourseDraft draft)
        {
            var elements = new Dictionary<Guid, string>();
            foreach (var module in draft.Modules)
            {
                elements.Add(module.Id, module.Title);
                foreach (var lesson in module.Lessons)
                {
                    elements.Add(lesson.Id, lesson.Title);
                    foreach (var block in lesson.Blocks) elements.Add(block.Id, JsonSerializer.Serialize(block, JsonOptions));
                }
            }
            return elements;
        }
        var draft = CourseLearningService.Read(version);
        var current = Elements(draft);
        var before = previous is null ? new Dictionary<Guid, string>() : Elements(CourseLearningService.Read(previous));
        return new { version.Id, version.Number, version.PublishedAt, draft.Title,
            added = current.Keys.Except(before.Keys).Count(),
            removed = before.Keys.Except(current.Keys).Count(),
            changed = current.Count(x => before.TryGetValue(x.Key, out var value) && value != x.Value),
            lessons = draft.Modules.SelectMany(m => m.Lessons).Select(l => new { l.Id, l.Title }) };
    }

    private static CourseDraft WithoutSnapshots(CourseDraft draft) => draft with { Description = CourseRichText.PlainText(new CourseDraftBlock(Guid.Empty, "theory", "", draft.Description) { RichText = draft.DescriptionRichText }), Modules = draft.Modules.Select(m => m with {
        Lessons = m.Lessons.Select(l => l with { Blocks = l.Blocks.Select(b => b with { PublishedExercise = null, PublishedActivity = null, Text = CourseRichText.PlainText(b) }).ToArray() }).ToArray()
    }).ToArray() };
}
