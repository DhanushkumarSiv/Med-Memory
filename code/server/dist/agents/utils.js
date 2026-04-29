"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runClaudeJson = runClaudeJson;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
function extractTextContent(content) {
    return content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
}
function isRateLimitError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return message.includes("rate limit") || message.includes("429");
}
async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
async function runClaudeJson(systemPrompt, userPayload) {
    const run = async () => anthropic.messages.create({
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
        let response;
        try {
            response = await run();
        }
        catch (error) {
            if (!isRateLimitError(error)) {
                throw error;
            }
            await sleep(2000);
            response = await run();
        }
        const textContent = extractTextContent(response.content);
        const parsed = JSON.parse(textContent);
        const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
        if (process.env.NODE_ENV === "development") {
            // eslint-disable-next-line no-console
            console.log("[Agent Output]", parsed);
        }
        return { data: parsed, tokensUsed };
    }
    catch (error) {
        return {
            data: null,
            tokensUsed: 0,
            error: error.message,
        };
    }
}
