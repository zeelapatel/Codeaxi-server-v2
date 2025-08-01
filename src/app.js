const express = require('express');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const documentationRoutes = require('./routes/documentationRoutes');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());

// Serve static documentation files
app.use('/docs', express.static(path.join(process.cwd(), 'public', 'docs')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/docs', documentationRoutes);

// Health check route
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// Error handling middleware
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
