using IronLanguage.Db;

namespace IronLanguage.Web.Models;

public sealed record DialogueState(int Index, DialogueLogEntry[] Log, int TurnAttempts);
public sealed record DialogueLogEntry(int Line, string CharacterId, string Text);

public sealed record DialogueWord(string Text, int Position, DictionaryMatch[] Matches);

public sealed record DialogueLineView(int Line, string CharacterId, string Name, string Color, string Text, string Side, DialogueWord[] Words);
public sealed record DialogueTurnView(int Line, string Kind, string[] Options, bool Skippable, int Attempts);
public sealed record DialogueCounters(int Attempts, int Errors, int Hints, int Turns);
public sealed record DialogueSummary(int Turns, int Errors, int Hints);
public sealed record DialogueHint(int Stage, string? Prefix, string? Expected, int? CorrectIndex);

public sealed record DialogueSessionView(
    Guid SessionId, Guid DialogueId, int DialogueVersion, string Title, bool Finished,
    DialogueLineView[] Lines, DialogueTurnView? Turn, DialogueCounters Counters, DialogueSummary? Summary,
    DialogueMeaningView[] Dictionary);

public sealed record DialogueAnswerView(
    bool Correct, DialogueHint? Hint, DialogueLineView[] Lines, DialogueTurnView? Turn,
    DialogueCounters Counters, bool Finished, DialogueSummary? Summary,
    DialogueMeaningView[] Dictionary);

public sealed record DialogueMeaningView(Guid Id, string Ossetian, string Russian, string RussianHeadword, string Note);

public sealed record DialogueConditionsView(
    Guid Id, string Title, string Dialect, int Level,
    DialogueCharacterView[] Characters, DialogueLineView[] Lines, DialogueTurnView[] Turns);

public sealed record DialogueCharacterView(string Id, string Name, string Color);

public sealed record DialogueHistoryItem(Guid SessionId, DateTimeOffset CompletedAt, string Title, int Turns, int Errors, int Hints);

public sealed record DialogueAnswerInput(int TurnId, string? Value, bool Skip);
