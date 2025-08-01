const { OpenAI } = require('openai');
const { queryCodeDB } = require('./ChromaService');
const { getRepoMetadata } = require('./repoAnalysisService');
const RepoMetadata = require('../models/RepoMetadata');

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
});

class ProgressiveDocumentationService {
    constructor() {
        this.documentationCache = new Map();
    }

    /**
     * Generates a ChromaDB query based on current documentation context
     * @param {Object} context - Current documentation context
     * @returns {Promise<string>} Generated query
     */
    async generateNextQuery(context) {
        const prompt = `Generate search query for next doc section.

Current: ${context.currentSection.substring(0, 500)}...
Done: ${context.completedSections.join(', ')}
Next: ${context.nextSection}

Return only the search query text.`;

        console.log(`[LLM] Generating query for section: ${context.nextSection}`);
        console.time(`[LLM] Query generation time`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: "You are an expert at analyzing documentation needs and generating precise queries to find relevant code."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1
        });

        console.timeEnd(`[LLM] Query generation time`);
        const query = completion.choices[0].message.content.trim();
        console.log(`[LLM] Generated query: "${query}"`);

        return completion.choices[0].message.content.trim();
    }

    /**
     * Validates if the retrieved context is suitable for the current documentation needs
     * @param {string} query - The query used
     * @param {Array} results - Query results
     * @param {Object} context - Current documentation context
     * @returns {Promise<Object>} Validation results
     */
    async validateQueryResults(query, results, context) {
        // Handle empty or invalid results
        if (!results || !Array.isArray(results) || results.length === 0) {
            console.warn('[LLM] No results to validate');
            return {
                isRelevant: false,
                confidence: 0,
                reasoning: "No results found",
                suggestedQuery: query
            };
        }

        // Extract file paths and content snippets
        const resultSummaries = results.map(r => ({
            path: r.metadata?.file_path || 'Unknown file',
            snippet: r.content ? r.content.substring(0, 100) + '...' : 'No content'
        }));

        const prompt = `Are these results relevant for ${context.nextSection}?

Query: ${query}

Results:
${resultSummaries.map(r => `File: ${r.path}
Snippet: ${r.snippet}`).join('\n\n')}

Return JSON:
{
    "isRelevant": boolean,
    "confidence": number,
    "reasoning": "brief why",
    "suggestedQuery": "optional"
}`;

        console.log(`[LLM] Validating query results for section: ${context.nextSection}`);
        console.time(`[LLM] Query validation time`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: "You are an expert at analyzing code context relevance for documentation."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        console.timeEnd(`[LLM] Query validation time`);
        const result = JSON.parse(completion.choices[0].message.content);
        console.log(`[LLM] Validation result: Relevant=${result.isRelevant}, Confidence=${result.confidence}%${result.suggestedQuery ? `, Suggested Query="${result.suggestedQuery}"` : ''}`);

        return JSON.parse(completion.choices[0].message.content);
    }

    /**
     * Generates documentation for a section using the provided context
     * @param {Array} codeContext - Relevant code context
     * @param {Object} docContext - Documentation context
     * @returns {Promise<Object>} Generated documentation and next steps
     */
    async generateDocumentationSection(codeContext, docContext) {
        // Handle empty or invalid context
        if (!codeContext || !Array.isArray(codeContext) || codeContext.length === 0) {
            console.warn('[LLM] No code context provided for documentation');
            return {
                documentation: `No code found for ${docContext.nextSection} section.`,
                nextSection: "Error Handling",
                requiredContext: "Error handling and edge cases",
                progress: Math.min((docContext.progress || 0) + 10, 100)
            };
        }

        // Process and format code context
        const formattedContext = codeContext.map(c => {
            const filePath = c.metadata?.file_path || 'Unknown file';
            const content = c.content || 'No content available';
            return `File: ${filePath}\nContent:\n${content.substring(0, 300)}...`;
        }).join('\n\n');

        const prompt = `Document ${docContext.nextSection}:

Code Context:
${formattedContext}

Previous Sections: ${docContext.completedSections.join(', ')}

Return JSON:
{
    "documentation": "content",
    "nextSection": "next topic",
    "requiredContext": "what's needed next",
    "progress": number
}`;

        console.log(`[LLM] Generating documentation for section: ${docContext.nextSection}`);
        console.time(`[LLM] Documentation generation time`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: "You are an expert technical writer specializing in API documentation."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        console.timeEnd(`[LLM] Documentation generation time`);
        const result = JSON.parse(completion.choices[0].message.content);
        console.log(`[LLM] Generated documentation for ${docContext.nextSection}:
  - Next section: ${result.nextSection}
  - Progress: ${result.progress}%
  - Required context: ${result.requiredContext}`);

        return JSON.parse(completion.choices[0].message.content);
    }

    /**
     * Progressively generates documentation for a project
     * @param {string} projectId - Project identifier
     * @returns {Promise<Object>} Generated documentation
     */
    async generateDocumentation(projectId) {
        // Initialize documentation context
        let docContext = {
            currentSection: "",
            completedSections: [],
            nextSection: "Overview",
            progress: 0
        };

        // Get repository metadata
        const repoMetadata = await getRepoMetadata(projectId);
        if (!repoMetadata) {
            throw new Error('Repository metadata not found');
        }

        // Update project status
        await RepoMetadata.findOneAndUpdate(
            { projectId },
            { 
                'documentationProgress.status': 'generating',
                'documentationProgress.currentStep': 'Overview'
            }
        );

        // Initialize documentation storage
        let fullDocumentation = "";

        while (docContext.progress < 100) {
            // Generate query for next section
            const query = await this.generateNextQuery(docContext);
            
            // Get relevant code context
            const results = await queryCodeDB(query, projectId, 10);
            
            // Validate query results
            const validation = await this.validateQueryResults(query, results.documents[0], docContext);
            
            if (!validation.isRelevant) {
                // Try with suggested query if available
                if (validation.suggestedQuery) {
                    const newResults = await queryCodeDB(validation.suggestedQuery, projectId, 10);
                    const newValidation = await this.validateQueryResults(validation.suggestedQuery, newResults.documents[0], docContext);
                    if (newValidation.isRelevant) {
                        results = newResults;
                    }
                }
            }

            // Generate documentation section
            const sectionResult = await this.generateDocumentationSection(results.documents[0], docContext);
            
            // Update documentation
            fullDocumentation += "\n\n" + sectionResult.documentation;
            
            // Update context
            docContext = {
                currentSection: sectionResult.documentation,
                completedSections: [...docContext.completedSections, docContext.nextSection],
                nextSection: sectionResult.nextSection,
                progress: sectionResult.progress
            };

            // Update progress in database
            await RepoMetadata.findOneAndUpdate(
                { projectId },
                { 
                    'documentationProgress.currentStep': docContext.nextSection,
                    'documentationProgress.completedSections': docContext.completedSections,
                    'documentationProgress.lastUpdated': new Date()
                }
            );

            // Cache the current state
            this.documentationCache.set(projectId, {
                fullDocumentation,
                context: docContext,
                lastUpdated: new Date()
            });
        }

        // Update final status
        await RepoMetadata.findOneAndUpdate(
            { projectId },
            { 
                'documentationProgress.status': 'completed',
                'documentationProgress.lastUpdated': new Date()
            }
        );

        return fullDocumentation;
    }

    /**
     * Gets the current documentation progress
     * @param {string} projectId - Project identifier
     * @returns {Promise<Object>} Documentation progress
     */
    async getDocumentationProgress(projectId) {
        const metadata = await RepoMetadata.findOne({ projectId });
        return metadata ? metadata.documentationProgress : null;
    }
}

module.exports = new ProgressiveDocumentationService();