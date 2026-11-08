using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

// The initial authoring contract supports theory. Exercise adapters are added separately;
// unsupported blocks must never be silently published as theory.
public sealed record CourseDraft(string Title, string Description, CourseDraftModule[] Modules);
public sealed record CourseDraftModule(Guid Id, string Title, CourseDraftLesson[] Lessons);
public sealed record CourseDraftLesson(Guid Id, string Title, CourseDraftBlock[] Blocks);
public sealed record CourseDraftBlock(Guid Id, string Kind, string Title, string Text);

public sealed class CourseAuthoringService(ICourseRepository courses)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void Validate(CourseDraft draft, bool publishing)
    {
        if (string.IsNullOrWhiteSpace(draft.Title) || draft.Title.Length > 150)
            throw new ArgumentException("Укажите название до 150 символов.");
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
                    if (block.Kind != "theory") throw new ArgumentException("Этот тип блока ещё не поддерживается новой системой курсов.");
                    if (block.Text is null || block.Text.Length > 20_000 || publishing && string.IsNullOrWhiteSpace(block.Text))
                        throw new ArgumentException("Заполните текст теории (до 20 000 символов).");
                }
            }
        }
    }

    public Task<Course> Create(Guid owner, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        return courses.Create(owner, JsonSerializer.Serialize(draft, JsonOptions), ct);
    }

    public Task<Course?> Save(Guid id, Guid owner, long stamp, CourseDraft draft, CancellationToken ct)
    {
        Validate(draft, false);
        return courses.Save(id, owner, stamp, JsonSerializer.Serialize(draft, JsonOptions), ct);
    }

    public async Task<CourseVersion?> Publish(Guid id, Guid owner, long stamp, bool reviewed, CancellationToken ct)
    {
        if (!reviewed) throw new ArgumentException("Подтвердите проверку содержания и прав на материалы.");
        var course = await courses.Owned(id, owner, ct);
        if (course is null || course.DraftStamp != stamp) return null;
        var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, JsonOptions)
            ?? throw new ArgumentException("Не удалось прочитать черновик.");
        Validate(draft, true);
        return await courses.Publish(id, owner, stamp, course.DraftJson, ct);
    }
}
