import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";

/**
 * The coach turns a plain description into a plan the app can render and the
 * learner can act on today. It never scores anyone, and it stays inside what
 * the course is for: ordinary, practical, non-shaming next steps.
 */

export const scheduleInputSchema = z.object({
  /** Free description of the day: commitments, prayer times, school, work. */
  day: z.string().min(12).max(1200),
  /** What the learner wants to make room for. */
  goals: z.string().max(600).optional(),
});

export const leaveInputSchema = z.object({
  /** The habit the learner wants to leave behind, in their own words. */
  habit: z.string().min(3).max(400),
  /** When it usually happens, if they know. */
  context: z.string().max(600).optional(),
});

export const scheduleResultSchema = z.object({
  summary: z.string(),
  blocks: z.array(z.object({
    time: z.string(),
    title: z.string(),
    detail: z.string(),
    kind: z.enum(["anchor", "work", "care", "rest"]),
  })),
  notes: z.array(z.string()),
});

export const leaveResultSchema = z.object({
  summary: z.string(),
  triggers: z.array(z.string()),
  replacement: z.string(),
  environment: z.array(z.string()),
  onASlip: z.string(),
  firstStep: z.string(),
  seekHelp: z.boolean(),
});

export type ScheduleResult = z.infer<typeof scheduleResultSchema>;
export type LeaveResult = z.infer<typeof leaveResultSchema>;

const HOUSE_STYLE = `You are helping inside "Hundred Steps to Life", a 100-day course.

How this course speaks:
- Practical and specific. Never motivational filler.
- A missed day is information, not a verdict. Never shame, never scold.
- Small and repeatable beats ambitious and abandoned.
- Islam is the foundation of the course. Respect prayer times and religious
  commitments as fixed anchors when the person mentions them. Do NOT quote
  Qur'an, hadith, or attribute sayings to the Prophet — this course requires
  such quotations to be verified by a person before publication.
- Do not give medical, clinical, legal, or religious rulings.

Write in British English. Keep every field short enough to act on.`;

const jsonSchema = (name: string, schema: Record<string, unknown>) => ({
  name,
  schema,
  strict: true,
});

async function ask(messages: Message[], schema: ReturnType<typeof jsonSchema>) {
  const result = await invokeLLM({
    messages,
    responseFormat: { type: "json_schema", json_schema: schema },
    maxTokens: 1600,
  });
  const content = result.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => ("text" in part ? part.text : "")).join("")
      : "";
  if (!text.trim()) throw new Error("The coach returned nothing to read.");
  return JSON.parse(text) as unknown;
}

export async function buildSchedule(input: z.infer<typeof scheduleInputSchema>) {
  const raw = await ask(
    [
      { role: "system", content: `${HOUSE_STYLE}

Build a realistic daily schedule from what the person describes. Rules:
- Use only the commitments they actually gave you. Never invent obligations.
- Treat prayer, school, madressa and work as fixed anchors (kind "anchor").
- Leave gaps. A schedule with no slack is a schedule that breaks on day two.
- 6 to 10 blocks. Times as plain ranges like "07:00 – 07:30".
- "notes" holds at most three short, practical cautions about the plan.` },
      { role: "user", content: `My day: ${input.day}${input.goals ? `\n\nWhat I want to make room for: ${input.goals}` : ""}` },
    ],
    jsonSchema("daily_schedule", {
      type: "object",
      additionalProperties: false,
      required: ["summary", "blocks", "notes"],
      properties: {
        summary: { type: "string" },
        blocks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["time", "title", "detail", "kind"],
            properties: {
              time: { type: "string" },
              title: { type: "string" },
              detail: { type: "string" },
              kind: { type: "string", enum: ["anchor", "work", "care", "rest"] },
            },
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
    }),
  );
  return scheduleResultSchema.parse(raw);
}

export async function buildLeavePlan(input: z.infer<typeof leaveInputSchema>) {
  const raw = await ask(
    [
      { role: "system", content: `${HOUSE_STYLE}

Help the person leave a habit behind. Rules:
- Name the likely triggers from what they said. Do not guess wildly.
- Give one concrete replacement action for the moment the pull arrives.
- Environment changes must be things they can do today, in their own home or
  on their own phone.
- "onASlip" must be recovery, never punishment.
- "firstStep" is one small thing to do in the next hour.
- Set "seekHelp" true if what they describe suggests addiction, self-harm,
  or anything needing a doctor or counsellor. When true, say so plainly and
  kindly in the summary, and keep the rest of the plan gentle and small.` },
      { role: "user", content: `The habit I want to leave: ${input.habit}${input.context ? `\n\nWhen it usually happens: ${input.context}` : ""}` },
    ],
    jsonSchema("leave_plan", {
      type: "object",
      additionalProperties: false,
      required: ["summary", "triggers", "replacement", "environment", "onASlip", "firstStep", "seekHelp"],
      properties: {
        summary: { type: "string" },
        triggers: { type: "array", items: { type: "string" } },
        replacement: { type: "string" },
        environment: { type: "array", items: { type: "string" } },
        onASlip: { type: "string" },
        firstStep: { type: "string" },
        seekHelp: { type: "boolean" },
      },
    }),
  );
  return leaveResultSchema.parse(raw);
}
