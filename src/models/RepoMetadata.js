const mongoose = require('mongoose');

const fileMetadataSchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    language: { type: String },
    size: { type: Number },
    lastModified: { type: Date },
    isDocumentationCandidate: { type: Boolean, default: false },
    importance: { type: Number, default: 0 }, // 0-100 score from LLM analysis
    documentationContext: { type: String }, // LLM's reasoning about this file's importance
});

const repoMetadataSchema = new mongoose.Schema({
    projectId: { type: String, required: true, unique: true },
    totalFiles: { type: Number, required: true },
    languages: [String],
    mainBranch: { type: String, default: 'main' },
    files: [fileMetadataSchema],
    entryPoints: [{
        filePath: { type: String },
        reason: { type: String },
        priority: { type: Number }
    }],
    documentationProgress: {
        status: { type: String, enum: ['pending', 'analyzing', 'generating', 'completed'], default: 'pending' },
        currentStep: { type: String },
        completedSections: [String],
        lastUpdated: { type: Date }
    }
}, { timestamps: true });

const RepoMetadata = mongoose.model('RepoMetadata', repoMetadataSchema);

module.exports = RepoMetadata;