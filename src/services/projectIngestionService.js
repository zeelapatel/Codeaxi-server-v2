// src/services/projectIngestionService.js
const Project = require('../models/Project');
const { cloneRepository, cleanupRepository, scanCodeFiles } = require('./gitService');
const { getCodeChunks } = require('../services/languageParser');
const { addCodeChunksToDB, resetCollection, getOrCreateCodeCollection } = require('./ChromaService');
const path = require('path');

/**
 * Orchestrates the full ingestion process for a new or updated project.
 * @param {string} projectId - The unique ID of the project.
 */
async function ingestProject(projectId) {
    let project;
    let localRepoPath = null; // To keep track for cleanup

    try {
        project = await Project.findOne({ projectId: projectId });
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found.`);
        }

        // 1. Update project status to cloning
        await project.updateProcessingStatus('cloning');

        // 2. Clone the repository
        localRepoPath = await cloneRepository(
            project.githubUrl,
            project.projectId,
            project.githubBranch
        );

        // 3. Update project status to ingesting
        await project.updateProcessingStatus('ingesting');

        // 4. Only reset collection if this is a re-sync (not first time)
        // Check if lastSyncedAt exists to determine if this is a re-sync
        if (project.lastSyncedAt) {
            await resetCollection(project.projectId);
        }

        // 5. Scan for code files
        const codeFilePaths = await scanCodeFiles(localRepoPath);

        // 6. Process and add chunks to ChromaDB
        if (codeFilePaths.length === 0) {
            console.warn(`No supported code files found in project ${projectId}.`);
        }

        // Create a *new* collection for this project if it doesn't exist
        const projectCollection = await getOrCreateCodeCollection(project.projectId);

        for (const filePath of codeFilePaths) {
            const relativeFilePath = path.relative(localRepoPath, filePath);
            console.log(`  Parsing and embedding: ${relativeFilePath}`);
            const chunks = await getCodeChunks(filePath);
            if (chunks.length > 0) {
                chunks.forEach(chunk => chunk.metadata.projectId = project.projectId);
                await addCodeChunksToDB(chunks, project.projectId);
            }
        }

        // 7. Update project status to active
        await project.updateProcessingStatus('active');
        console.log(`Project ${projectId} successfully ingested.`);

    } catch (error) {
        console.error(`Error ingesting project ${projectId}:`, error);
        if (project) {
            await project.updateProcessingStatus('error', {
                message: error.message,
                code: error.code || 'INGESTION_FAILED'
            });
        }
    } finally {
        // 8. Clean up the cloned repository
        if (localRepoPath) {
            await cleanupRepository(projectId);
        }
    }
}

module.exports = {
    ingestProject
};