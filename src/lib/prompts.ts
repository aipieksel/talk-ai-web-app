interface PromptDoc {
  id: string;
  name: string;
  instructions: string;
  builtIn: boolean;
}

export const DEFAULT_PROMPT_ID = "default-cleanup";

export const BUILTIN_PROMPTS: PromptDoc[] = [
  {
    id: DEFAULT_PROMPT_ID,
    name: "Default Cleanup",
    instructions: `Fix grammar and punctuation.
Remove filler words such as "um," "uh," "like," and "you know."
Remove false starts and repetitions.
Preserve meaning and intent.
Preserve tone and style.
Add no information that was not in the original.
Return only cleaned text, without explanations.`,
    builtIn: true,
  },
  {
    id: "agent-brief",
    name: "Agent Brief",
    instructions: `You turn spoken, thinking-out-loud instructions into a clear brief for a software-engineering agent.

Hard rules:
- Keep the speaker's goal and scope exactly. Do not add features, files, APIs, libraries, architecture, or steps they did not say.
- Do not invent product requirements. If they were vague, keep the vagueness rather than filling gaps.
- Do not change the job. Tighten language; never enlarge or shrink the request.
- Fix terminology: replace incorrect or improvised words with the standard industry term that matches what they clearly meant. If two readings are possible, keep their wording and put the likely term in parentheses once.
- Remove filler (um, uh, like, you know, kinda, sort of, I guess), false starts, and abandoned drafts. When they correct themselves, keep only the correction.
- Preserve every requirement, preference, constraint, and example they actually stated.
- Make the result grammatical, specific, and easy for an agent to execute.
- Prefer concrete verbs: build, change, move, rename, extract, test, wire, deploy.

Structure the result as:
Goal
Context (only facts they stated)
Requirements
Constraints (omit this heading if they stated none)
Out of scope (omit this heading if they stated none)

If they listed work, also add a numbered checklist. Each item must map to something they said. Never pad the list.

Return only the brief. No preamble, no apology, no commentary.`,
    builtIn: true,
  },
  {
    id: "dev-checklist",
    name: "Dev Checklist",
    instructions: `Convert the spoken instructions into an actionable software-development checklist.

Rules:
- Output a markdown checklist (- [ ] item). Group with short headings only when they clearly changed topic.
- Each item must be a single concrete task an engineer can do.
- Do not add tasks they did not ask for. Do not add tests, docs, refactors, or polish unless they asked.
- Do not change scope. Do not "improve" the plan.
- Fix terminology to industry-standard language that matches their intent. Do not replace their meaning.
- Remove filler, false starts, and repetitions. Keep the latest correction when they change their mind.
- Preserve names, files, libraries, and constraints they mentioned. Do not invent missing names.
- If they stated a goal, put one line at the top: Goal: …
- Return only the checklist (and the Goal line if present).`,
    builtIn: true,
  },
  {
    id: "agent-tasks",
    name: "Agent Tasks",
    instructions: `Rewrite rambling build instructions into a tight task list for a coding agent.

Rules:
- Keep their main goal as the first line, prefixed with Goal:
- Then a numbered list of tasks, in the order they implied.
- Use precise engineering language (component, route, store, schema, handler, migration, prop, query) only when it matches what they meant.
- Do not add requirements, files, or steps they did not mention.
- Do not drop requirements they did mention, even if they were messy.
- Strip filler and self-narration ("what I want is", "if that makes sense").
- One sentence per task. Start with a verb.
- Return only the goal line and the numbered list.`,
    builtIn: true,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    instructions: `Turn the transcript into concise meeting notes.

Use these headings when the content exists, otherwise skip the heading:
Summary
Decisions
Action items (owner — task — due date if spoken)
Open questions

Rules:
- Do not invent owners, dates, or decisions.
- Remove filler and false starts.
- Keep names and numbers accurate.
- Return only the notes.`,
    builtIn: true,
  },
  {
    id: "slack-message",
    name: "Slack Message",
    instructions: `Rewrite the transcript as a Slack message ready to paste.

Rules:
- Short paragraphs. No subject line.
- Keep the speaker's intent, tone, and asks.
- Remove filler, rambling, and self-corrections.
- Do not add information.
- Use backticks for code, file, or command names if they were spoken.
- Return only the message.`,
    builtIn: true,
  },
  {
    id: "email",
    name: "Email",
    instructions: `Rewrite the transcript as a professional email.

Include:
Subject: …
A greeting if a recipient was named, otherwise skip it.
Body
A sign-off only if the speaker implied one.

Rules:
- Do not invent recipients, facts, or offers.
- Fix grammar. Remove filler.
- Keep the ask obvious in the first paragraph.
- Return only the email.`,
    builtIn: true,
  },
  {
    id: "commit-message",
    name: "Commit Message",
    instructions: `Rewrite the transcript as a git commit message.

Rules:
- First line: imperative, ≤ 72 characters, no trailing period.
- Optional body after a blank line, wrapped, explaining why — only using facts they said.
- Do not invent ticket numbers, file lists, or breaking-change notes.
- Remove filler.
- Return only the commit message.`,
    builtIn: true,
  },
  {
    id: "bug-report",
    name: "Bug Report",
    instructions: `Turn the transcript into a bug report.

Use these headings when the content exists:
Title
What happened
What I expected
Steps
Workaround

Rules:
- Do not invent repro steps, environments, or expected behavior.
- Keep error text and numbers exact.
- Remove filler.
- Return only the report.`,
    builtIn: true,
  },
  {
    id: "standup",
    name: "Standup",
    instructions: `Rewrite the transcript as a standup update with three headings:
Yesterday
Today
Blockers

Rules:
- Put each item on its own bullet.
- If a heading has no content from the speaker, write None.
- Do not invent work.
- Remove filler.
- Return only the update.`,
    builtIn: true,
  },
  {
    id: "user-story",
    name: "User Story",
    instructions: `Rewrite the transcript as a user story.

Format:
Title
As a … I want … so that …
Acceptance criteria (bullets, only from what they said)

Rules:
- Do not invent persona, benefit, or criteria.
- If they did not state a benefit, omit "so that".
- Remove filler. Keep scope unchanged.
- Return only the story.`,
    builtIn: true,
  },
];

export const BUILTIN_PROMPT = BUILTIN_PROMPTS[0]!;

export const BUILTIN_IDS = new Set(BUILTIN_PROMPTS.map((p) => p.id));

export function mergePrompts(saved: PromptDoc[] | undefined): PromptDoc[] {
  const custom = (saved ?? []).filter((p) => !p.builtIn && !BUILTIN_IDS.has(p.id));
  return [...BUILTIN_PROMPTS, ...custom];
}
