const express = require('express');
const router = express.Router();
const { generateDocumentation } = require('../controllers/documentationController');
const auth = require('../middleware/auth');

// Generate documentation for project code
router.post('/:projectId/document', auth, generateDocumentation);

module.exports = router; 