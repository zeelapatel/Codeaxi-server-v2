const Project = require('../models/Project');

// Create a new project with GitHub repository
const createProject = async (req, res) => {
  try {
    const { githubUrl, name, description, isPrivate } = req.body;

    // Validate required fields
    if (!githubUrl) {
      return res.status(400).json({
        message: 'GitHub repository URL is required'
      });
    }

    // Extract repo name from GitHub URL to use as project name if not provided
    let projectName = name;
    if (!projectName) {
      try {
        const url = new URL(githubUrl);
        const [, , repo] = url.pathname.split('/');
        projectName = repo.replace('.git', '');
      } catch (error) {
        return res.status(400).json({
          message: 'Invalid GitHub repository URL format'
        });
      }
    }

    // Create new project
    const project = new Project({
      githubUrl,
      name: projectName,
      description,
      owner: req.user.userId,
      settings: {
        isPrivate: isPrivate ?? true
      }
    });

    await project.save();

    res.status(201).json({
      message: 'Project created successfully',
      project: {
        projectId: project.projectId,
        name: project.name,
        description: project.description,
        githubUrl: project.githubUrl,
        githubOwner: project.githubOwner,
        githubRepoName: project.githubRepoName,
        githubBranch: project.githubBranch,
        status: project.status,
        settings: project.settings,
        createdAt: project.createdAt
      }
    });
  } catch (error) {
    console.error('Project creation error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Invalid project data',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      message: 'Error creating project'
    });
  }
};

// Get all projects for a user
const getUserProjects = async (req, res) => {
  try {
    const projects = await Project.findUserProjects(req.user.userId);
    res.json({
      projects: projects.map(project => ({
        projectId: project.projectId,
        name: project.name,
        description: project.description,
        githubUrl: project.githubUrl,
        githubOwner: project.githubOwner,
        githubRepoName: project.githubRepoName,
        status: project.status,
        lastSyncedAt: project.lastSyncedAt,
        error: project.error,
        createdAt: project.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Error fetching projects' });
  }
};

// Get project by projectId
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findOne({ 
      projectId: req.params.projectId,
      status: { $ne: 'deleted' }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.isOwner(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Error fetching project' });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const { name, description, isPrivate, githubBranch } = req.body;
    
    const project = await Project.findOne({ 
      projectId: req.params.projectId,
      status: { $ne: 'deleted' }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.isOwner(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (isPrivate !== undefined) project.settings.isPrivate = isPrivate;
    if (githubBranch) project.githubBranch = githubBranch;

    await project.save();

    res.json({
      message: 'Project updated successfully',
      project
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Error updating project' });
  }
};

// Delete project (soft delete)
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOne({ 
      projectId: req.params.projectId,
      status: { $ne: 'deleted' }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.isOwner(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    project.status = 'deleted';
    await project.save();

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Error deleting project' });
  }
};

// Update GitHub access token
const updateGithubToken = async (req, res) => {
  try {
    const { githubAccessToken } = req.body;
    
    if (!githubAccessToken) {
      return res.status(400).json({
        message: 'GitHub access token is required'
      });
    }

    const project = await Project.findOne({ 
      projectId: req.params.projectId,
      status: { $ne: 'deleted' }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.isOwner(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    project.githubAccessToken = githubAccessToken;
    await project.save();

    // Update connection status
    await project.updateConnectionStatus(true);

    res.json({
      message: 'GitHub token updated successfully',
      project: {
        projectId: project.projectId,
        status: project.status,
        lastSyncedAt: project.lastSyncedAt
      }
    });
  } catch (error) {
    console.error('Error updating GitHub token:', error);
    res.status(500).json({ message: 'Error updating GitHub token' });
  }
};

module.exports = {
  createProject,
  getUserProjects,
  getProjectById,
  updateProject,
  deleteProject,
  updateGithubToken
}; 