const express = require('express');
const {
  createProject,
  getUserProjects,
  getProjectById,
  updateProject,
  deleteProject,
  updateGithubToken
} = require('../controllers/projectController');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Project routes
router.post('/', createProject);
router.get('/', getUserProjects);
router.get('/:projectId', getProjectById);
router.put('/:projectId', updateProject);
router.delete('/:projectId', deleteProject);

// GitHub token update
router.put('/:projectId/github-token', updateGithubToken);

module.exports = router; 