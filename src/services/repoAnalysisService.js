const { OpenAI } = require('openai');
const { scanCodeFiles } = require('./gitService');
const RepoMetadata = require('../models/RepoMetadata');
const path = require('path');

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
});

/**
 * Analyzes all files' importance for API documentation in a single call
 * @param {Array<Object>} files - Array of file information objects
 * @param {string} projectContext - Overall project context
 * @returns {Promise<Array<Object>>} Analysis results for all files
 */
async function analyzeFilesImportance(files, projectContext) {
    console.log(`[LLM] Analyzing ${files.length} files in single batch`);

    const filesByType = files.reduce((acc, file) => {
        if (!acc[file.language]) {
            acc[file.language] = [];
        }
        acc[file.language].push(file.filePath);
        return acc;
    }, {});

    const prompt = `Analyze all project files for API documentation importance (0-100).

Project Structure:
${Object.entries(filesByType).map(([lang, files]) => `
${lang.toUpperCase()} Files:
${files.map(f => `- ${f}`).join('\n')}`).join('\n')}

Project Context: ${projectContext}

Consider:
1. API endpoints and controllers
2. Core business logic and services
3. Data models and schemas
4. Important utilities and middleware
5. Configuration and setup files

For each file, determine:
- Importance for API documentation (0-100)
- Whether it should be included in documentation
- Brief reason for its importance

Return a JSON array with analysis for EVERY file, sorted by importance:
[{
    "filePath": "path/to/file",
    "importance": number,
    "isDocumentationCandidate": boolean,
    "reason": "brief explanation"
}]`;

    try {
        console.time(`[LLM] Project analysis time`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: "You are an expert at analyzing code files and determining their importance for API documentation. You understand different file types and their roles in a project."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        console.timeEnd(`[LLM] Project analysis time`);
        const response = JSON.parse(completion.choices[0].message.content);
        
        // Ensure we have an array of results
        const results = Array.isArray(response) ? response : 
                       Array.isArray(response.results) ? response.results :
                       Array.isArray(response.files) ? response.files : [];

        if (results.length === 0) {
            console.warn('[LLM] No results returned from analysis, using default values');
            return files.map(file => ({
                filePath: file.filePath,
                importance: 0,
                isDocumentationCandidate: false,
                reason: 'No analysis results'
            }));
        }

        // Log summary of results
        try {
            const candidateFiles = results.filter(r => r.isDocumentationCandidate);
            console.log(`[LLM] Analysis complete:
- Total files analyzed: ${results.length}
- Documentation candidates: ${candidateFiles.length}
- High importance files (>70): ${results.filter(r => r.importance > 70).length}
- Medium importance files (40-70): ${results.filter(r => r.importance >= 40 && r.importance <= 70).length}
- Low importance files (<40): ${results.filter(r => r.importance < 40).length}`);

            // Log top 5 most important files
            const topFiles = [...results]
                .sort((a, b) => b.importance - a.importance)
                .slice(0, 5);
            console.log('\n[LLM] Top 5 most important files:');
            topFiles.forEach(file => {
                console.log(`- ${file.filePath} (Importance: ${file.importance}): ${file.reason}`);
            });
        } catch (error) {
            console.error('[LLM] Error processing analysis results:', error);
        }

        return results;

    } catch (error) {
        console.error('Error analyzing project files:', error);
        // Return default results for all files
        return files.map(file => ({
            filePath: file.filePath,
            importance: 0,
            isDocumentationCandidate: false,
            reason: 'Error during project analysis'
        }));
    }
}

/**
 * Identifies potential entry points for documentation
 * @param {Array} files - Array of analyzed files
 * @returns {Promise<Array>} Sorted entry points
 */
async function identifyEntryPoints(files) {
    const prompt = `Find API doc entry points from:
${files.map(f => `${f.filePath} (Score: ${f.importance})`).join('\n')}

Return JSON array:
[{
    "filePath": "path",
    "reason": "brief why",
    "priority": number
}]`;

    try {
        console.log(`[LLM] Identifying entry points for ${files.length} files`);
        console.time(`[LLM] Entry point analysis time`);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: "You are an expert at analyzing codebases and identifying the best entry points for documentation."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        console.timeEnd(`[LLM] Entry point analysis time`);
        const response = JSON.parse(completion.choices[0].message.content);
        
        // Ensure we have an array of entry points
        const entryPoints = Array.isArray(response) ? response : 
                          Array.isArray(response.entryPoints) ? response.entryPoints :
                          Array.isArray(response.files) ? response.files : [];

        if (entryPoints.length === 0) {
            console.warn('[LLM] No entry points identified');
            return [];
        }

        console.log(`[LLM] Identified ${entryPoints.length} entry points:`, 
            entryPoints.map(ep => `\n  - ${ep.filePath} (Priority: ${ep.priority})`).join(''));

        return entryPoints;
    } catch (error) {
        console.error('Error identifying entry points:', error);
        return [];
    }
}

/**
 * Analyzes repository and stores metadata
 * @param {string} projectId - Project identifier
 * @param {string} localRepoPath - Path to cloned repository
 */
async function analyzeAndStoreRepoMetadata(projectId, localRepoPath) {
    try {
        // Scan for all code files
        const codeFilePaths = await scanCodeFiles(localRepoPath);
        
        // Initialize metadata
        let metadata = {
            projectId,
            totalFiles: codeFilePaths.length,
            languages: new Set(),
            files: []
        };

        // Prepare file info for batch analysis
        const fileInfos = codeFilePaths.map(filePath => {
            const relativeFilePath = path.relative(localRepoPath, filePath);
            const extension = path.extname(filePath).toLowerCase();
            const language = extension.replace('.', '');
            
            metadata.languages.add(language);

            return {
                fileName: path.basename(filePath),
                filePath: relativeFilePath,
                language,
                size: 0, // You might want to add actual file size
                lastModified: new Date()
            };
        });

        // Analyze files in batches
        const analysisResults = await analyzeFilesImportance(fileInfos, JSON.stringify(metadata));
        
        // Map results back to metadata
        metadata.files = analysisResults.map(analysis => ({
            fileName: path.basename(analysis.filePath),
            filePath: analysis.filePath,
            language: path.extname(analysis.filePath).replace('.', ''),
            size: 0,
            lastModified: new Date(),
            isDocumentationCandidate: analysis.isDocumentationCandidate,
            importance: analysis.importance,
            documentationContext: analysis.reason
        }));

        // Convert languages Set to array
        metadata.languages = Array.from(metadata.languages);

        // Identify entry points
        const entryPoints = await identifyEntryPoints(metadata.files);
        metadata.entryPoints = entryPoints;

        // Store in database
        await RepoMetadata.findOneAndUpdate(
            { projectId },
            metadata,
            { upsert: true, new: true }
        );

        return metadata;
    } catch (error) {
        console.error('Error analyzing repository:', error);
        throw error;
    }
}

/**
 * Gets repository metadata from the database
 * @param {string} projectId - Project identifier
 * @returns {Promise<Object>} Repository metadata
 */
async function getRepoMetadata(projectId) {
    try {
        const metadata = await RepoMetadata.findOne({ projectId });
        if (!metadata) {
            console.warn(`[Repo] No metadata found for project ${projectId}`);
            return null;
        }
        return metadata;
    } catch (error) {
        console.error(`[Repo] Error fetching metadata for project ${projectId}:`, error);
        throw error;
    }
}

module.exports = {
    analyzeAndStoreRepoMetadata,
    analyzeFilesImportance,
    identifyEntryPoints,
    getRepoMetadata
};