const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 5000;

// Utility function to wrap async route handlers
// This ensures that all asynchronous errors are automatically caught and passed to the Express error handler.
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Middlewares
app.use(cors()); 
app.use(express.json()); 

// Custom Middleware: Set Referrer-Policy
// This sets a default policy for your site's responses, controlling how much information
// is sent when requesting external resources like Google Fonts.
app.use((req, res, next) => {
    // 'no-referrer-when-downgrade' is less strict than 'strict-origin-when-cross-origin' 
    // and is generally secure, sending the full referrer URL only if security is maintained (HTTPS to HTTPS).
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    next();
});

// 1. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// 2. Route Handling
// Note: This requires a 'routes/userRoutes.js' file that accepts the asyncHandler utility.
const userRoutes = require('./routes/userRoutes')(asyncHandler);
app.use('/api/users', userRoutes); 

// 3. Enhanced Global Error Handler (Must be defined last)
app.use((err, req, res, next) => {
    console.error('Error Stack:', err.stack);
    
    // Mongoose validation error (e.g., missing required field)
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            msg: 'Validation Error',
            errors: Object.values(err.errors).map(e => e.message) 
        });
    }
    
    // Mongoose duplicate key error (code 11000, typically for unique fields like email)
    if (err.code === 11000) {
        // Extract the field that caused the error (e.g., 'email')
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({ msg: `Duplicate value entered for field: ${field}` });
    }
    
    // Mongoose bad ObjectId (CastError, e.g., searching with a malformed ID)
    if (err.name === 'CastError') {
        return res.status(404).json({ msg: 'Resource not found' });
    }
    
    // Default server error
    // In production, we hide the specific error message for security.
    res.status(500).json({ 
        msg: 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});