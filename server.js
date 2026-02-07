const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Utility function to wrap async route handlers
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Health check endpoint - MANDATORY for Render
app.get('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStatus = mongoState === 1 ? 'connected' : 
                     mongoState === 2 ? 'connecting' :
                     mongoState === 3 ? 'disconnecting' : 'disconnected';
  
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Mapped Backend API',
    mongo: mongoStatus,
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Mapped Backend API is running',
    endpoints: {
      health: '/health',
      users: '/api/users',
      trainee: '/api/trainee',
      session: '/api/session',
      progress: '/api/progress',
      beltProgress: '/api/belt-progress',
      resources: '/api/resources',
      profile: '/api/profile',
      forum: '/api/forum'
    },
    documentation: 'API documentation available at /api-docs (if implemented)'
  });
});

// Middleware setup
app.use(cors({
  origin: '*', // For development - restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mapped', mongoOptions)
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('⚠️  Server will continue running without database connection');
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

// Test endpoints (for debugging)
app.post('/api/test-trainee', (req, res) => {
  console.log('✅ Test route received data:', req.body);
  res.json({ 
    success: true, 
    message: 'Test route working!',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'API is working correctly',
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Mapped API Endpoints',
    version: '1.0.0',
    endpoints: {
      users: {
        path: '/api/users',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'User management'
      },
      trainee: {
        path: '/api/trainee',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Trainee management'
      },
      session: {
        path: '/api/session',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Training sessions'
      },
      progress: {
        path: '/api/progress',
        methods: ['GET', 'POST', 'PUT'],
        description: 'Progress tracking'
      },
      beltProgress: {
        path: '/api/belt-progress',
        methods: ['GET', 'POST', 'PUT'],
        description: 'Belt progress tracking'
      },
      resources: {
        path: '/api/resources',
        methods: ['GET', 'POST', 'DELETE'],
        description: 'Resource management'
      },
      profile: {
        path: '/api/profile',
        methods: ['GET', 'PUT'],
        description: 'User profiles'
      },
      forum: {
        path: '/api/forum',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Forum discussions'
      }
    }
  });
});

// Load and use routes with error handling
try {
  // User routes
  const userRoutes = require('./routes/userRoutes');
  if (typeof userRoutes === 'function') {
    app.use('/api/users', userRoutes(asyncHandler));
    console.log('✅ User routes loaded');
  } else {
    console.log('⚠️  User routes not a function, using default');
    app.use('/api/users', (req, res) => res.status(501).json({ error: 'User routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load user routes:', error.message);
  app.use('/api/users', (req, res) => res.status(501).json({ error: 'User routes failed to load' }));
}

try {
  // Trainee routes
  const traineeRoutes = require('./routes/traineeRoutes');
  if (typeof traineeRoutes === 'function') {
    app.use('/api/trainee', traineeRoutes(asyncHandler));
    console.log('✅ Trainee routes loaded');
  } else {
    console.log('⚠️  Trainee routes not a function, using default');
    app.use('/api/trainee', (req, res) => res.status(501).json({ error: 'Trainee routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load trainee routes:', error.message);
  app.use('/api/trainee', (req, res) => res.status(501).json({ error: 'Trainee routes failed to load' }));
}

try {
  // Session routes
  const sessionRoutes = require('./routes/sessionRoutes');
  if (typeof sessionRoutes === 'function') {
    app.use('/api/session', sessionRoutes(asyncHandler));
    console.log('✅ Session routes loaded');
  } else {
    console.log('⚠️  Session routes not a function, using default');
    app.use('/api/session', (req, res) => res.status(501).json({ error: 'Session routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load session routes:', error.message);
  app.use('/api/session', (req, res) => res.status(501).json({ error: 'Session routes failed to load' }));
}

try {
  // Progress routes
  const progressRoutes = require('./routes/progressRoutes');
  if (typeof progressRoutes === 'function') {
    app.use('/api/progress', progressRoutes(asyncHandler));
    console.log('✅ Progress routes loaded');
  } else {
    console.log('⚠️  Progress routes not a function, using default');
    app.use('/api/progress', (req, res) => res.status(501).json({ error: 'Progress routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load progress routes:', error.message);
  app.use('/api/progress', (req, res) => res.status(501).json({ error: 'Progress routes failed to load' }));
}

try {
  // Belt progress routes
  const beltProgressRoutes = require('./routes/beltProgressRoutes');
  if (typeof beltProgressRoutes === 'function') {
    app.use('/api/belt-progress', beltProgressRoutes(asyncHandler));
    console.log('✅ Belt progress routes loaded');
  } else {
    console.log('⚠️  Belt progress routes not a function, using default');
    app.use('/api/belt-progress', (req, res) => res.status(501).json({ error: 'Belt progress routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load belt progress routes:', error.message);
  app.use('/api/belt-progress', (req, res) => res.status(501).json({ error: 'Belt progress routes failed to load' }));
}

try {
  // Resource routes
  const resourceRoutes = require('./routes/resourceRoutes');

  if (typeof resourceRoutes === 'function' && !resourceRoutes.stack) {
      app.use('/api/resources', resourceRoutes(asyncHandler));
  } else {
      app.use('/api/resources', resourceRoutes);
  }
  console.log('✅ Resource routes loaded');
} catch (error) {
  console.error('❌ Failed to load resource routes:', error.message);
  app.use('/api/resources', (req, res) => res.status(501).json({ error: 'Resource routes failed to load' }));
}

try {
  // Profile routes
  const profileRoutes = require('./routes/profileRoutes');
  if (typeof profileRoutes === 'function') {
    app.use('/api/profile', profileRoutes);
    console.log('✅ Profile routes loaded');
  } else {
    console.log('⚠️  Profile routes not a function, using default');
    app.use('/api/profile', (req, res) => res.status(501).json({ error: 'Profile routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load profile routes:', error.message);
  app.use('/api/profile', (req, res) => res.status(501).json({ error: 'Profile routes failed to load' }));
}

try {
  // Forum routes
  const forumRoutes = require('./routes/forumRoutes');
  if (typeof forumRoutes === 'function') {
    app.use('/api/forum', forumRoutes);
    console.log('✅ Forum routes loaded');
  } else {
    console.log('⚠️  Forum routes not a function, using default');
    app.use('/api/forum', (req, res) => res.status(501).json({ error: 'Forum routes not implemented' }));
  }
} catch (error) {
  console.error('❌ Failed to load forum routes:', error.message);
  app.use('/api/forum', (req, res) => res.status(501).json({ error: 'Forum routes failed to load' }));
}

// FIXED: 404 handler for undefined API routes - Using regex instead of wildcard
app.use(/^\/api\/.+$/, (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.originalUrl} not found`,
    availableEndpoints: [
      '/api',
      '/api/users',
      '/api/trainee',
      '/api/session',
      '/api/progress',
      '/api/belt-progress',
      '/api/resources',
      '/api/profile',
      '/api/forum',
      '/health',
      '/api/test',
      '/api/test-trainee'
    ]
  });
});

// Catch-all for other undefined routes
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    // Already handled by the regex above, but just in case
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
      suggestion: 'Check /api for available endpoints'
    });
  } else {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
      availableRoutes: ['/', '/health', '/api']
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Error Stack:', err.stack);
  console.error('🔥 Error Details:', {
    message: err.message,
    name: err.name,
    path: req.path,
    method: req.method,
    body: req.body
  });
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry',
      field: field,
      value: err.keyValue[field]
    });
  }
  
  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      path: err.path,
      value: err.value
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }
  
  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    message: message,
    ...(process.env.NODE_ENV !== 'production' && {
      error: err.message,
      stack: err.stack
    })
  });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
  🚀 Server is running!
  📍 Port: ${port}
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
  ⏰ Time: ${new Date().toLocaleString()}
  🔗 Health Check: http://localhost:${port}/health
  🔗 API Test: http://localhost:${port}/api/test
  🔗 API Docs: http://localhost:${port}/api
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;