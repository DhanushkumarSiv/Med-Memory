"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRagVectorInfrastructure = ensureRagVectorInfrastructure;
exports.upsertRagVectorDocuments = upsertRagVectorDocuments;
exports.searchRagVectorDocuments = searchRagVectorDocuments;
const neo4j_1 = require("../db/neo4j");
const VECTOR_INDEX_NAME = "rag_health_embeddings";
let infrastructureReady = false;
function cosineSimilarity(a, b) {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
        return 0;
    }
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i += 1) {
        const left = a[i] ?? 0;
        const right = b[i] ?? 0;
        dot += left * right;
        magA += left * left;
        magB += right * right;
    }
    if (magA === 0 || magB === 0) {
        return 0;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
async function ensureRagVectorInfrastructure(dimension) {
    if (infrastructureReady) {
        return;
    }
    await (0, neo4j_1.runQuery)("CREATE CONSTRAINT IF NOT EXISTS FOR (d:RagHealthVector) REQUIRE d.docId IS UNIQUE");
    await (0, neo4j_1.runQuery)("CREATE INDEX IF NOT EXISTS FOR (d:RagHealthVector) ON (d.patientId)");
    await (0, neo4j_1.runQuery)("CREATE INDEX IF NOT EXISTS FOR (d:RagHealthVector) ON (d.timestamp)");
    try {
        await (0, neo4j_1.runQuery)(`
      CREATE VECTOR INDEX ${VECTOR_INDEX_NAME} IF NOT EXISTS
      FOR (d:RagHealthVector)
      ON (d.embedding)
      OPTIONS { indexConfig: { \`vector.dimensions\`: $dimension, \`vector.similarity_function\`: 'cosine' } }
      `, { dimension });
    }
    catch {
        // Neo4j version may not support vector index syntax. Fallback retrieval handles this.
    }
    infrastructureReady = true;
}
async function upsertRagVectorDocuments(documents) {
    if (documents.length === 0) {
        return;
    }
    await (0, neo4j_1.runQuery)(`
    UNWIND $docs AS doc
    MERGE (d:RagHealthVector {docId: doc.docId})
    SET d.patientId = doc.patientId,
        d.resourceId = doc.resourceId,
        d.resourceType = doc.resourceType,
        d.timestamp = doc.timestamp,
        d.sourceName = doc.sourceName,
        d.summary = doc.summary,
        d.rawData = doc.rawData,
        d.embedding = doc.embedding,
        d.labels = doc.labels,
        d.systolic = doc.systolic,
        d.diastolic = doc.diastolic,
        d.glucose = doc.glucose,
        d.hba1c = doc.hba1c,
        d.heartRate = doc.heartRate,
        d.updatedAt = datetime().toString()
    `, { docs: documents });
}
async function queryByVectorIndex(embedding, patientId, topK) {
    const rows = await (0, neo4j_1.runQuery)(`
    CALL db.index.vector.queryNodes($indexName, $topK, $embedding)
    YIELD node, score
    WHERE $patientId IS NULL OR node.patientId = $patientId
    RETURN node.docId AS docId,
           node.patientId AS patientId,
           node.resourceId AS resourceId,
           node.resourceType AS resourceType,
           node.timestamp AS timestamp,
           node.sourceName AS sourceName,
           node.summary AS summary,
           node.rawData AS rawData,
           coalesce(node.labels, []) AS labels,
           score
    ORDER BY score DESC
    LIMIT $topK
    `, {
        indexName: VECTOR_INDEX_NAME,
        topK,
        embedding,
        patientId,
    });
    return rows.map((row) => ({
        ...row,
        score: Number(row.score ?? 0),
    }));
}
async function queryByCypherSimilarity(embedding, patientId, topK) {
    const rows = await (0, neo4j_1.runQuery)(`
    MATCH (d:RagHealthVector)
    WHERE $patientId IS NULL OR d.patientId = $patientId
    WITH d, vector.similarity.cosine(d.embedding, $embedding) AS score
    RETURN d.docId AS docId,
           d.patientId AS patientId,
           d.resourceId AS resourceId,
           d.resourceType AS resourceType,
           d.timestamp AS timestamp,
           d.sourceName AS sourceName,
           d.summary AS summary,
           d.rawData AS rawData,
           coalesce(d.labels, []) AS labels,
           score
    ORDER BY score DESC
    LIMIT $topK
    `, { patientId, embedding, topK });
    return rows.map((row) => ({
        ...row,
        score: Number(row.score ?? 0),
    }));
}
async function queryByApplicationSimilarity(embedding, patientId, topK) {
    const rows = await (0, neo4j_1.runQuery)(`
    MATCH (d:RagHealthVector)
    WHERE $patientId IS NULL OR d.patientId = $patientId
    RETURN d.docId AS docId,
           d.patientId AS patientId,
           d.resourceId AS resourceId,
           d.resourceType AS resourceType,
           d.timestamp AS timestamp,
           d.sourceName AS sourceName,
           d.summary AS summary,
           d.rawData AS rawData,
           coalesce(d.labels, []) AS labels,
           d.embedding AS embedding
    `, { patientId });
    return rows
        .map((row) => ({
        docId: row.docId,
        patientId: row.patientId,
        resourceId: row.resourceId,
        resourceType: row.resourceType,
        timestamp: row.timestamp,
        sourceName: row.sourceName,
        summary: row.summary,
        rawData: row.rawData,
        labels: row.labels,
        score: cosineSimilarity(row.embedding ?? [], embedding),
    }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
async function searchRagVectorDocuments(embedding, patientId, topK) {
    try {
        return await queryByVectorIndex(embedding, patientId, topK);
    }
    catch {
        try {
            return await queryByCypherSimilarity(embedding, patientId, topK);
        }
        catch {
            return queryByApplicationSimilarity(embedding, patientId, topK);
        }
    }
}
