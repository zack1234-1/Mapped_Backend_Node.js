const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 5000;

// Utility function for async handlers
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middlewares
app.use(cors()); 
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Remove any Referrer-Policy headers for API
app.use((req, res, next) => {
  // Render-specific: override any default CSP headers
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Security-Policy');
  res.removeHeader('X-WebKit-CSP');
  
  // Set API-appropriate headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
const userRoutes = require('./routes/userRoutes')(asyncHandler);
app.use('/api/users', userRoutes); 

const profileRoutes = require('./routes/profileRoutes');
app.use('/api/profile', profileRoutes);

const forumRoutes = require('./routes/forumRoutes');
app.use('/api/forum', forumRoutes);

// Health check endpoint (required for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'User API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      register: 'POST /api/users/register',
      login: 'POST /api/users/login',
      getUsers: 'GET /api/users'
    }
  });
});

// 404 handler - FIXED for Express 5
// Use regex pattern instead of string
app.use(/.*/, (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: 'This is a REST API endpoint. Use /api/users for user operations.'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Always return JSON
  res.setHeader('Content-Type', 'application/json');
  
  // Handle specific errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({
      error: 'Duplicate Entry',
      field: Object.keys(err.keyValue)[0]
    });
  }
  
  // Default error
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});