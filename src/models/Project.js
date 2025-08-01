
// src/models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectId: {
    type: String,
    unique: true,
    trim: true,
    sparse: true // Allows null/undefined values to be unique
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId, // Assuming you have a User model
    ref: 'User',
    required: true
  },
  // GitHub configuration
  githubUrl: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Basic GitHub URL validation
        return /^https:\/\/github\.com\/[\w-]+\/[\w-]+(\/?|\.git)$/.test(v);
      },
      message: 'Invalid GitHub repository URL'
    }
  },
  githubRepoName: {
    type: String,
    trim: true
  },
  githubOwner: {
    type: String,
    trim: true
  },
  githubBranch: {
    type: String,
    trim: true,
    default: 'main'
  },
  githubAccessToken: { // For future private repo support
    type: String,
    trim: true,
    select: false // This field won't be returned in queries by default
  },
  // Project status and metadata
  status: {
    type: String,
    enum: ['pending', 'cloning', 'ingesting', 'active', 'error', 'archived', 'deleted'],
    default: 'pending' // Initial status before any processing starts
  },
  lastSyncedAt: {
    type: Date,
    default: null
  },
  settings: {
    isPrivate: { // Not directly used for clone, but good metadata
      type: Boolean,
      default: false // Default to public as per requirement 3
    },
    autoSync: {
      type: Boolean,
      default: false // Default to false for manual trigger simplicity now
    }
  },
  error: {
    message: String,
    code: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Generate unique project ID and parse GitHub URL before saving
projectSchema.pre('save', async function(next) {
  try {
    // Generate projectId if not exists
    if (!this.projectId) {
      const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.projectId = `PRJ-${randomString}`;
    }

    // Parse GitHub URL if it's new or modified
    if (this.isModified('githubUrl')) {
      const url = new URL(this.githubUrl);
      const [, owner, repo] = url.pathname.split('/');
      
      this.githubOwner = owner;
      this.githubRepoName = repo.replace('.git', '');
      
      // Set name from repo if not provided
      if (!this.name || this.name.trim() === '') {
        this.name = this.githubRepoName;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check if user is owner (dummy User ID for testing)
projectSchema.methods.isOwner = function(userId) {
  // In a real app, userId would be a mongoose.Types.ObjectId
  return this.owner && this.owner.toString() === userId.toString();
};

// Static method to find user's projects
projectSchema.statics.findUserProjects = function(userId) {
  return this.find({ 
    owner: userId, 
    status: { $ne: 'deleted' } 
  })
  .select('-githubAccessToken')
  .sort('-createdAt');
};

// Method to update GitHub connection status
projectSchema.methods.updateProcessingStatus = function(newStatus, errorDetails = null) {
  this.status = newStatus;
  if (newStatus === 'error' && errorDetails) {
    this.error = {
      message: errorDetails.message,
      code: errorDetails.code,
      timestamp: new Date()
    };
  } else {
    this.error = null; // Clear error if status is not 'error'
  }
  this.lastSyncedAt = new Date(); // Update sync timestamp on any status change (could be more specific)
  return this.save();
};


const Project = mongoose.model('Project', projectSchema);

module.exports = Project;