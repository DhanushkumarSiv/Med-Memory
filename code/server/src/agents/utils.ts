import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentRunResult<T> {
  data: T | null;
  tokensUsed: number;
  error?: string;
}

function extractTextContent(content: Anthropic.Message["content"]): string {
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("rate limit") || message.includes("429");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runClaudeJson<T>(systemPrompt: string, userPayload: string): Promise<AgentRunResult<T>> {
  const run = async (): Promise<Anthropic.Message> =>
    anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPayload }],
    });

  try {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Agent Input]", { systemPrompt, userPayload });
    }

    let response: Anthropic.Message;
    try {
      response = await run();
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }
      await sleep(2000);
      response = await run();
    }

    const textContent = extractTextContent(response.content);
    const parsed = JSON.parse(textContent) as T;
    const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Agent Output]", parsed);
    }

    return { data: parsed, tokensUsed };
  } catch (error) {
    return {
      data: null,
      tokensUsed: 0,
      error: (error as Error).message,
    };
  }
}
