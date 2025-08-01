const Project = require('../models/Project');
const { analyzeAndStoreRepoMetadata } = require('../services/repoAnalysisService');
const progressiveDocService = require('../services/progressiveDocumentationService');
const { generateDocumentationWithLLM } = require('../services/llmService');
const { cloneRepository, cleanupRepository } = require('../services/gitService');
const { Packer } = require('docx');
const fs = require('fs').promises;
const path = require('path');

// Create docs directory if it doesn't exist
const DOCS_DIR = path.join(process.cwd(), 'public', 'docs');
fs.mkdir(DOCS_DIR, { recursive: true }).catch(console.error);

// Generate documentation for project code
const generateDocumentation = async (req, res) => {
    try {
        const project = await Project.findOne({ 
            projectId: req.params.projectId,
            status: { $ne: 'deleted' }
        });
        console.log(process.env.OPENAI_API_KEY);
        if (!project || project.status !== 'active') {
            return res.status(400).json({ 
                message: 'Project not found or not yet active (ingestion not complete).' 
            });
        }

        if (!project.isOwner(req.user.userId)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Create project-specific docs directory
        const projectDocsDir = path.join(DOCS_DIR, project.projectId);
        await fs.mkdir(projectDocsDir, { recursive: true });

        // Clone the repository first
        const localRepoPath = await cloneRepository(
            project.githubUrl,
            project.projectId,
            project.githubBranch
        );

        // Analyze the repository and store metadata
        await analyzeAndStoreRepoMetadata(project.projectId, localRepoPath);

        // Generate documentation progressively
        const documentation = await progressiveDocService.generateDocumentation(project.projectId);

        // Create Word document
        const doc = await generateDocumentationWithLLM(documentation);

        // Save the documentation
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const mainFileName = 'documentation.docx';
        const versionFileName = `documentation-${timestamp}.docx`;

        // Convert document to buffer
        const mainBuffer = await Packer.toBuffer(doc);
        const versionBuffer = Buffer.from(mainBuffer);

        // Save current version and versioned copy
        await fs.writeFile(path.join(projectDocsDir, mainFileName), mainBuffer);
        await fs.writeFile(path.join(projectDocsDir, versionFileName), versionBuffer);

        // Generate docs URL
        const docsUrl = `/docs/${project.projectId}/${mainFileName}`;
        const versionedUrl = `/docs/${project.projectId}/${versionFileName}`;

        res.status(200).json({ 
            message: 'Documentation generated successfully',
            documentation: {
                currentUrl: docsUrl,
                versionedUrl: versionedUrl,
                projectId: project.projectId,
                generatedAt: timestamp
            }
        });

    } catch (error) {
        if (error.code === 'QUOTA_EXCEEDED') {
            return res.status(503).json({ 
                message: error.message,
                error: error.code,
                details: error.details
            });
        }
        
        if (error.code === 'RATE_LIMIT') {
            return res.status(429).json({ 
                message: error.message,
                error: error.code
            });
        }

        console.error('Error generating documentation:', error);
        res.status(500).json({ 
            message: 'Failed to generate documentation.',
            error: error.message 
        });
    } finally {
        // Clean up cloned repository if project exists
        if (req.params.projectId) {
            try {
                await cleanupRepository(req.params.projectId);
            } catch (cleanupError) {
                console.error('Error cleaning up repository:', cleanupError);
            }
        }
    }
};

// Get documentation generation progress
const getDocumentationProgress = async (req, res) => {
    try {
        const progress = await progressiveDocService.getDocumentationProgress(req.params.projectId);
        res.status(200).json({ progress });
    } catch (error) {
        console.error('Error fetching documentation progress:', error);
        res.status(500).json({ 
            message: 'Failed to fetch documentation progress',
            error: error.message 
        });
    }
};

module.exports = {
    generateDocumentation,
    getDocumentationProgress
};