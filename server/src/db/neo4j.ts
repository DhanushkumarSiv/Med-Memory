import neo4j, { Driver, Session } from "neo4j-driver";

let driver: Driver | undefined;

function toNative(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    const intValue = value.toNumber();
    return Number.isSafeInteger(intValue) ? intValue : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toNative(item));
  }

  if (value && typeof value === "object") {
    const maybeNode = value as { properties?: Record<string, unknown> };
    if (maybeNode.properties && typeof maybeNode.properties === "object") {
      return toNative(maybeNode.properties);
    }

    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toNative(val)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function getDriver(): Driver {
  if (!driver) {
    const username = process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME ?? "neo4j";
    driver = neo4j.driver(
      process.env.NEO4J_URI ?? "bolt://localhost:7687",
      neo4j.auth.basic(username, process.env.NEO4J_PASSWORD ?? "")
    );
  }
  return driver;
}

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const database = process.env.NEO4J_DATABASE;
  const session: Session = database ? getDriver().session({ database }) : getDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => {
      const row = record.toObject();
      return toNative(row) as T;
    });
  } finally {
    await session.close();
  }
}

export async function initConstraints(): Promise<void> {
  const statements = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Patient) REQUIRE p.abhaId IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Patient) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (c:ConsentToken) REQUIRE c.token IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (o:OtpRecord) REQUIRE o.id IS UNIQUE",
    "CREATE INDEX IF NOT EXISTS FOR (p:Patient) ON (p.phone)",
    "CREATE INDEX IF NOT EXISTS FOR (o:OtpRecord) ON (o.phone)",
  ];

  for (const statement of statements) {
    await runQuery(statement);
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = undefined;
  }
}
