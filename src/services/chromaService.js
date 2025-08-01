// src/chromaService.js
const { ChromaClient } = require('chromadb');
require('dotenv').config(); // Loads .env variables
const axios = require('axios');

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://10.110.25.148:5000/embed';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const client = new ChromaClient({
    path: CHROMA_URL
});

/**
 * Calls the external Python embedding service to get embeddings for texts.
 * @param {Array<string>} texts - An array of strings to embed.
 * @param {number} retryCount - Number of retries attempted.
 * @returns {Promise<Array<Array<number>>>} A promise that resolves to an array of embeddings.
 */
async function getEmbeddingsFromService(texts, retryCount = 0) {
    if (texts.length === 0) return [];
    try {
        console.log(`Attempting to get embeddings for ${texts.length} texts (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        const response = await axios.post(EMBEDDING_SERVICE_URL, { texts });
        if (!response.data || !Array.isArray(response.data.embeddings)) {
            throw new Error("Invalid response from embedding service.");
        }
        return response.data.embeddings;
    } catch (error) {
        console.error("Error getting embeddings from service:", error.response?.data || error.message);
        
        // If we haven't exceeded max retries and it's a potentially recoverable error
        if (retryCount < MAX_RETRIES - 1 && 
            (error.code === 'ECONNREFUSED' || error.response?.status >= 500)) {
            console.log(`Retrying embedding request in ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return getEmbeddingsFromService(texts, retryCount + 1);
        }
        
        throw new Error(`Failed to get embeddings from service after ${retryCount + 1} attempts. Is the Python service running?`);
    }
}

/**
 * Ensures the ChromaDB collection for a specific project exists and returns it.
 * Each project will have its own collection named after its projectId.
 * @param {string} projectId - The ID of the project, which will be the collection name.
 * @returns {Promise<Collection>} The ChromaDB collection object.
 */
async function getOrCreateCodeCollection(projectId) {
    const dynamicCollectionName = `project-${projectId}-code-chunks`;
    let collection;

    try {
        // Try to get existing collection
        console.log(`-----------------------------------------------------------------`);
        collection = await client.getCollection({
            name: dynamicCollectionName,
            embeddingFunction: {
                generate: async (texts) => {
                    try {
                        return await getEmbeddingsFromService(texts);
                    } catch (error) {
                        console.error('Error generating embeddings:', error);
                        throw error;
                    }
                }
            }
        });
        console.log(`Using existing collection '${dynamicCollectionName}'`);

    } catch (e) {
        if (!e.message.includes("does not exist")) {
            try {
                console.log(`+++++++++++++++++++++++++++++++++++++++++++++`);

                // Create new collection if it doesn't exist
                collection = await client.createCollection({
                    name: dynamicCollectionName,
                    embeddingFunction: {
                        generate: async (texts) => {
                            try {
                                return await getEmbeddingsFromService(texts);
                            } catch (error) {
                                console.error('Error generating embeddings:', error);
                                throw error;
                            }
                        }
                    }
                });
                console.log(`Created new collection '${dynamicCollectionName}'`);
            } catch (createError) {
                // Handle potential race condition where collection was created between our check and create
                if (createError.message.includes("already exists")) {
                    collection = await client.getCollection({
                        name: dynamicCollectionName,
                        embeddingFunction: {
                            generate: async (texts) => {
                                try {
                                    return await getEmbeddingsFromService(texts);
                                } catch (error) {
                                    console.error('Error generating embeddings:', error);
                                    throw error;
                                }
                            }
                        }
                    });
                    console.log(`Using existing collection '${dynamicCollectionName}' after creation attempt`);
                } else {
                    throw createError;
                }
            }
        } else {
            console.log(`00000000000000000000000000000000000000000`);
            throw e;
        }
    }

    return collection;
}

/**
 * Adds code chunks to the specified ChromaDB collection.
 * @param {Array<Object>} chunks - Array of chunk objects from languageParsers.js.
 * @param {string} projectId - The ID of the project whose collection to add to.
 */
async function addCodeChunksToDB(chunks, projectId) {
    if (chunks.length === 0) {
        return;
    }

    const collection = await getOrCreateCodeCollection(projectId);

    const ids = chunks.map(chunk => chunk.id);
    const documents = chunks.map(chunk => chunk.content);
    const metadatas = chunks.map(chunk => chunk.metadata);

    const validIndexes = documents.map((doc, i) => doc.trim() ? i : -1).filter(i => i !== -1);
    const validIds = validIndexes.map(i => ids[i]);
    const validDocuments = validIndexes.map(i => documents[i]);
    const validMetadatas = validIndexes.map(i => metadatas[i]);

    if (validDocuments.length === 0) {
        console.log("No valid, non-empty chunks to add after filtering.");
        return;
    }

    let embeddings;
    try {
        console.log(`Generating embeddings for ${validDocuments.length} documents...`);
        embeddings = await getEmbeddingsFromService(validDocuments);
        
        if (embeddings.length !== validDocuments.length) {
            throw new Error("Mismatch between number of documents and generated embeddings.");
        }

        console.log(`Attempting to add ${validDocuments.length} documents to collection ${collection.name}.`);
        await collection.add({
            ids: validIds,
            embeddings: embeddings,
            documents: validDocuments,
            metadatas: validMetadatas,
        });
        console.log(`Successfully added ${validDocuments.length} documents to ${collection.name}.`);
    } catch (error) {
        if (error.message.includes("Expected ids to be unique")) {
            console.error("Duplicate ID detected. Ensure your chunk IDs are unique within the project's collection.");
        } else {
            console.error("Error processing chunks:", error.message);
        }
        // Re-throw the error to be handled by the caller
        throw error;
    }
}

/**
 * Queries the ChromaDB for relevant code chunks within a specific project.
 * @param {string} queryText - The natural language query.
 * @param {string} projectId - The ID of the project to query within.
 * @param {number} nResults - Number of results to retrieve.
 * @param {Object} [metadataFilters={}] - Optional additional metadata filters.
 * @returns {Promise<QueryResult>} Query results from ChromaDB.
 */
async function queryCodeDB(queryText, projectId, nResults = 5, metadataFilters = {}) {
    const collection = await getOrCreateCodeCollection(projectId);

    let queryEmbeddings;
    try {
        console.log(`Generating embedding for query: "${queryText}"`);
        queryEmbeddings = await getEmbeddingsFromService([queryText]);

        console.log(`Querying ChromaDB collection '${collection.name}' for: "${queryText}" with filters:`, metadataFilters);
        
        // Prepare query parameters
        const queryParams = {
            queryEmbeddings: queryEmbeddings,
            nResults: nResults
        };

        // Only add where clause if there are actual filters
        if (Object.keys(metadataFilters).length > 0) {
            // Format the where clause according to ChromaDB's requirements
            // Construct where clause for each filter
            const whereConditions = {};
            Object.entries(metadataFilters).forEach(([key, value]) => {
                whereConditions[key] = value;
            });
            queryParams.where = whereConditions;
        }

        const results = await collection.query(queryParams);
        return results;
    } catch (error) {
        console.error("Error during query process:", error.message);
        throw new Error(`Failed to process query: ${error.message}`);
    }
}

/**
 * Resets (deletes) a specific ChromaDB collection by project ID.
 * This is used for re-ingestion or project deletion.
 * @param {string} projectId - The ID of the project whose collection to delete.
 */
async function resetCollection(projectId) {
    const dynamicCollectionName = `project-${projectId}-code-chunks`;
    try {
        // First check if collection exists
        try {
            await client.getCollection({ name: dynamicCollectionName });
            // If collection exists, delete it
            await client.deleteCollection({ name: dynamicCollectionName });
            console.log(`Collection '${dynamicCollectionName}' deleted for project ${projectId}.`);
        } catch (e) {
            if (e.message.includes("does not exist")) {
                console.log(`Collection '${dynamicCollectionName}' does not exist for project ${projectId}, will create new when needed.`);
                // Don't throw error, just continue since we'll create collection when needed
                return;
            }
            throw e; // Re-throw if it's a different error
        }
    } catch (e) {
        console.error("Error handling collection for project:", projectId, e);
        // Don't throw error up the chain, let the process continue
        // This allows new collection creation even if deletion fails
    }
}

module.exports = {
    getOrCreateCodeCollection,
    addCodeChunksToDB,
    queryCodeDB,
    resetCollection,
    client
};