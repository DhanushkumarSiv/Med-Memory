const DEFAULT_EMBEDDING_DIMENSION = 256;

const DOMAIN_SYNONYM_GROUPS: string[][] = [
  ["blood pressure", "bp", "systolic", "diastolic", "mmhg", "hypertension"],
  ["sugar", "glucose", "blood sugar", "hba1c", "a1c", "diabetes"],
  ["heart rate", "pulse", "bpm", "cardiac", "tachycardia", "bradycardia"],
  ["kidney", "egfr", "creatinine", "renal"],
  ["cholesterol", "ldl", "hdl", "triglyceride", "lipid"],
  ["allergy", "adverse reaction", "contraindication"],
  ["medication", "dose", "dosage", "tablet", "capsule", "drug"],
  ["lab", "test", "result", "diagnostic", "investigation"],
  ["weight", "bmi", "obesity"],
  ["temperature", "fever", "celsius", "fahrenheit"],
];

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return values;
  }
  return values.map((value) => value / magnitude);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.%/\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function extractCharacterTrigrams(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length < 3) {
    return normalized.length > 0 ? [normalized] : [];
  }
  const trigrams: string[] = [];
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    trigrams.push(normalized.slice(i, i + 3));
  }
  return trigrams;
}

function scoreDomainGroups(text: string): number[] {
  const lowered = text.toLowerCase();
  return DOMAIN_SYNONYM_GROUPS.map((group) => {
    let score = 0;
    for (const term of group) {
      if (lowered.includes(term)) {
        score += 1;
      }
    }
    return score;
  });
}

function resizeVector(values: number[], dimension: number): number[] {
  if (values.length === dimension) {
    return values;
  }
  if (values.length > dimension) {
    const resized: number[] = new Array(dimension).fill(0);
    for (let i = 0; i < values.length; i += 1) {
      const index = Math.floor((i / values.length) * dimension);
      const target = Math.min(index, dimension - 1);
      resized[target] = (resized[target] ?? 0) + (values[i] ?? 0);
    }
    return resized;
  }
  return values.concat(new Array(dimension - values.length).fill(0));
}

function embedLocally(text: string, dimension: number): number[] {
  const vector: number[] = new Array(dimension).fill(0);
  const tokens = tokenize(text);
  const trigrams = extractCharacterTrigrams(text);
  const domainScores = scoreDomainGroups(text);

  for (const token of tokens) {
    const index = hashToken(token) % dimension;
    vector[index] = (vector[index] ?? 0) + 1.3;
  }

  for (const gram of trigrams) {
    const index = hashToken(gram) % dimension;
    vector[index] = (vector[index] ?? 0) + 0.35;
  }

  for (let i = 0; i < domainScores.length; i += 1) {
    const index = (i * 17) % dimension;
    vector[index] = (vector[index] ?? 0) + (domainScores[i] ?? 0) * 2.2;
  }

  return normalizeVector(vector);
}

function averageVectors(values: number[][]): number[] {
  if (values.length === 0) {
    return [];
  }
  const dimension = values[0]?.length ?? 0;
  const average: number[] = new Array(dimension).fill(0);
  for (const vector of values) {
    for (let i = 0; i < dimension; i += 1) {
      average[i] = (average[i] ?? 0) + (vector[i] ?? 0);
    }
  }
  return average.map((value) => value / values.length);
}

function flattenUnknownEmbedding(payload: unknown): number[] | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  if (typeof payload[0] === "number") {
    return (payload as number[]).filter((value) => Number.isFinite(value));
  }

  if (Array.isArray(payload[0])) {
    const rows = (payload as unknown[])
      .filter((item): item is number[] => Array.isArray(item))
      .map((row) => row.filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
    if (rows.length === 0) {
      return null;
    }
    return averageVectors(rows);
  }

  return null;
}

async function embedWithHuggingFace(text: string, dimension: number): Promise<number[] | null> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.HF_EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2";
  const endpoint = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  const flattened = flattenUnknownEmbedding(payload);
  if (!flattened || flattened.length === 0) {
    return null;
  }

  return normalizeVector(resizeVector(flattened, dimension));
}

export async function embedText(text: string, dimension = DEFAULT_EMBEDDING_DIMENSION): Promise<number[]> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return new Array(dimension).fill(0);
  }

  try {
    const hostedEmbedding = await embedWithHuggingFace(normalizedText, dimension);
    if (hostedEmbedding) {
      return hostedEmbedding;
    }
  } catch {
    // Fall through to deterministic local embedding.
  }

  return embedLocally(normalizedText, dimension);
}

export function getEmbeddingDimension(): number {
  const raw = Number(process.env.RAG_EMBEDDING_DIMENSION ?? DEFAULT_EMBEDDING_DIMENSION);
  if (!Number.isFinite(raw) || raw < 32) {
    return DEFAULT_EMBEDDING_DIMENSION;
  }
  return Math.floor(raw);
}
