"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriver = getDriver;
exports.runQuery = runQuery;
exports.initConstraints = initConstraints;
exports.closeDriver = closeDriver;
exports.checkNeo4jHealth = checkNeo4jHealth;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
let driver;
function toNative(value) {
    if (neo4j_driver_1.default.isInt(value)) {
        const intValue = value.toNumber();
        return Number.isSafeInteger(intValue) ? intValue : value.toString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => toNative(item));
    }
    if (value && typeof value === "object") {
        const maybeNode = value;
        if (maybeNode.properties && typeof maybeNode.properties === "object") {
            return toNative(maybeNode.properties);
        }
        const entries = Object.entries(value).map(([key, val]) => [key, toNative(val)]);
        return Object.fromEntries(entries);
    }
    return value;
}
function getDriver() {
    if (!driver) {
        const username = process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME ?? "neo4j";
        const password = process.env.NEO4J_PASSWORD ?? "medmemory123";
        driver = neo4j_driver_1.default.driver(process.env.NEO4J_URI ?? "bolt://localhost:7687", neo4j_driver_1.default.auth.basic(username, password));
    }
    return driver;
}
async function runQuery(cypher, params = {}) {
    const database = process.env.NEO4J_DATABASE;
    const session = database ? getDriver().session({ database }) : getDriver().session();
    try {
        const result = await session.run(cypher, params);
        return result.records.map((record) => {
            const row = record.toObject();
            return toNative(row);
        });
    }
    finally {
        await session.close();
    }
}
async function initConstraints() {
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
async function closeDriver() {
    if (driver) {
        await driver.close();
        driver = undefined;
    }
}
async function checkNeo4jHealth() {
    try {
        await getDriver().verifyConnectivity();
        await runQuery("RETURN 1 AS ok");
        return { up: true };
    }
    catch (error) {
        return { up: false, error: error.message };
    }
}
