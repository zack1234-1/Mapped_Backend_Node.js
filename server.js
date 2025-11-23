const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 5000;

// Utility function to wrap async route handlers
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Middlewares
app.use(cors()); 
app.use(express.json()); 

// 1. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// 2. Route Handling
const userRoutes = require('./routes/userRoutes')(asyncHandler);
app.use('/api/users', userRoutes); 

// 3. Enhanced Global Error Handler
app.use((err, req, res, next) => {
    console.error('Error Stack:', err.stack);
    
    // Mongoose validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            msg: 'Validation Error',
            errors: Object.values(err.errors).map(e => e.message) 
        });
    }
    
    // Mongoose duplicate key error
    if (err.code === 11000) {
        return res.status(400).json({ msg: 'Duplicate field value entered' });
    }
    
    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        return res.status(400).json({ msg: 'Resource not found' });
    }
    
    // Default server error
    res.status(500).json({ 
        msg: 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});