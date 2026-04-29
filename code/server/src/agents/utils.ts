export interface AgentRunResult<T> {
  data: T | null;
  tokensUsed: number;
  error?: string;
}

interface GroqChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function extractJsonCandidate(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstObjectStart = content.indexOf("{");
  const lastObjectEnd = content.lastIndexOf("}");
  if (firstObjectStart >= 0 && lastObjectEnd > firstObjectStart) {
    return content.slice(firstObjectStart, lastObjectEnd + 1).trim();
  }

  const firstArrayStart = content.indexOf("[");
  const lastArrayEnd = content.lastIndexOf("]");
  if (firstArrayStart >= 0 && lastArrayEnd > firstArrayStart) {
    return content.slice(firstArrayStart, lastArrayEnd + 1).trim();
  }

  return content.trim();
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

function parseStructuredJson<T>(rawContent: string): T {
  const candidate = extractJsonCandidate(rawContent);
  return JSON.parse(candidate) as T;
}

export async function runGroqJson<T>(systemPrompt: string, userPayload: string): Promise<AgentRunResult<T>> {
  if (!process.env.GROQ_API_KEY) {
    return {
      data: null,
      tokensUsed: 0,
      error: "Missing GROQ_API_KEY",
    };
  }

  const run = async (): Promise<GroqChatCompletionResponse> => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_completion_tokens: 1500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
      }),
    });

    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Groq request failed with ${response.status}`);
    }
    return payload;
  };

  try {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Agent Input]", { systemPrompt, userPayload });
    }

    let response: Awaited<ReturnType<typeof run>>;
    try {
      response = await run();
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }
      await sleep(2000);
      response = await run();
    }

    const textContent = response.choices?.[0]?.message?.content ?? "";
    const parsed = parseStructuredJson<T>(textContent);
    const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

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
