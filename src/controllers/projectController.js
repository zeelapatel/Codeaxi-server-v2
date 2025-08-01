const Project = require('../models/Project');
const { ingestProject } = require('../services/projectIngestionService');

// Create a new project with GitHub repository
const createProject = async (req, res) => {
  try {
    const { githubUrl, name, description, githubBranch } = req.body;

    // Validate required fields
    if (!githubUrl) {
      return res.status(400).json({
        message: 'GitHub repository URL is required'
      });
    }

    // Create new project
    const project = new Project({
      githubUrl,
      name,
      description,
      owner: req.user.userId,
      githubBranch: githubBranch || 'main',
      status: 'pending' // Initial status
    });

    await project.save();

    res.status(201).json({
      message: 'Project created successfully. Ingestion process started.',
      project: {
        projectId: project.projectId,
        name: project.name,
        githubUrl: project.githubUrl,
        status: project.status
      }
    });

    // Asynchronously start the ingestion process
    ingestProject(project.projectId).catch(err => {
      console.error(`Error during async ingestion of project ${project.projectId}:`, err);
    });

  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({
      message: 'Failed to create project.',
      error: error.message
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
    res.status(500).json({ message: 'Error fetching projects', error: error.message });
  }
};

// Get project by projectId
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findOne({ 
      projectId: req.params.projectId,
      status: { $ne: 'deleted' }
    }).select('-githubAccessToken');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.isOwner(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Failed to retrieve project details.', error: error.message });
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
    res.status(500).json({ message: 'Error updating project', error: error.message });
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
    res.status(500).json({ message: 'Error deleting project', error: error.message });
  }
};

// Resync project
const resyncProject = async (req, res) => {
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

    project.status = 'pending'; // Set status to pending before re-ingestion
    await project.save();

    res.status(202).json({
      message: 'Project re-sync requested. Processing will begin shortly.',
      project: {
        projectId: project.projectId,
        status: project.status
      }
    });

    // Asynchronously start the re-ingestion process
    ingestProject(project.projectId).catch(err => {
      console.error(`Error during async re-ingestion of project ${project.projectId}:`, err);
    });

  } catch (error) {
    console.error('Error triggering re-sync:', error);
    res.status(500).json({ message: 'Failed to trigger re-sync.', error: error.message });
  }
};

module.exports = {
  createProject,
  getUserProjects,
  getProjectById,
  updateProject,
  deleteProject,
  resyncProject
}; 