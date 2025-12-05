module.exports = (asyncHandler) => {
    const express = require('express');
    const router = express.Router();
    const User = require('../models/User');

    // 1. REGISTER
    router.post('/register', asyncHandler(async (req, res, next) => {
        const { name, email, password } = req.body; 

        try {
            let user = await User.findOne({ email });

            if (user) {
                return res.status(400).json({ msg: 'User already exists' });
            }

            user = new User({ name, email, password });
            await user.save();
            
            return res.status(201).json({ 
                msg: 'User registered successfully', 
                name: user.name, 
                email: user.email 
            });
            
        } catch (err) {
            // Handle different types of errors
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    msg: 'Validation Error', 
                    errors: Object.values(err.errors).map(e => e.message) 
                });
            }
            
            if (err.code === 11000) { // MongoDB duplicate key error
                return res.status(400).json({ msg: 'Email already exists' });
            }
            
            // Pass to global error handler
            next(err); 
        }
    }));

    // ... rest of your routes remain the same
    //2. LOGIN
    router.post('/login', asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        try {
            const user = await User.findOne({ email });

            if (!user) {
                return res.status(400).json({ msg: 'Invalid Credentials' });
            }

            const isMatch = await user.verifyPassword(password);

            if (!isMatch) {
                return res.status(400).json({ msg: 'Invalid Credentials' });
            }

            res.json({ msg: 'Login successful', email: user.email });
        } catch (err) {
            res.status(500).json({ msg: 'Server error' });
        }    
    }));

    //3. GET ALL USERS
    router.get('/', asyncHandler(async (req, res) => {
        try{
            const users = await User.find({}).select('-password'); 
            res.json(users);
        } catch (err) {
            res.status(500).json({ msg: 'Server error' });
        }        
    }));

    return router;
};