const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];

export interface AgentRunResult<T> {
  data: T | null;
  tokensUsed: number;
  error?: string;
}

interface GroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface GroqMessage {
  content?: string | null;
}

interface GroqChoice {
  message?: GroqMessage;
}

interface GroqResponse {
  choices?: GroqChoice[];
  usage?: GroqUsage;
}

function extractMessageText(response: GroqResponse): string {
  return String(response.choices?.[0]?.message?.content ?? "").trim();
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstCurly = trimmed.indexOf("{");
  const lastCurly = trimmed.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    return trimmed.slice(firstCurly, lastCurly + 1);
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return trimmed;
}

function usageTokens(usage: GroqUsage | undefined): number {
  return Number(usage?.prompt_tokens ?? 0) + Number(usage?.completion_tokens ?? 0);
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
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing. Add it to your environment configuration.");
    }

    const preferredModel = process.env.GROQ_MODEL;
    const modelCandidates = preferredModel
      ? [preferredModel, ...DEFAULT_MODELS.filter((model) => model !== preferredModel)]
      : DEFAULT_MODELS;

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Agent Input]", { systemPrompt, userPayload, modelCandidates });
    }

    let response: GroqResponse | null = null;
    let lastError: Error | null = null;

    for (const model of modelCandidates) {
      const run = async (): Promise<GroqResponse> => {
        const httpResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 1500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });

        if (!httpResponse.ok) {
          const details = await httpResponse.text();
          throw new Error(`Groq API ${httpResponse.status}: ${details}`);
        }

        return (await httpResponse.json()) as GroqResponse;
      };

      try {
        try {
          response = await run();
        } catch (error) {
          if (!isRateLimitError(error)) {
            throw error;
          }
          await sleep(2000);
          response = await run();
        }
        lastError = null;
        break;
      } catch (error) {
        lastError = error as Error;
      }
    }

    if (!response) {
      throw lastError ?? new Error("Groq API call failed for all configured models.");
    }

    const textContent = extractMessageText(response);
    const parsed = JSON.parse(extractJsonObject(textContent)) as T;
    const tokensUsed = usageTokens(response.usage);

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
