module.exports = (asyncHandler) => {
    const express = require('express');
    const router = express.Router();
    const User = require('../models/User');
    const jwt = require('jsonwebtoken');
    const nodemailer = require('nodemailer');

    // --- EMAIL HELPER UTILITY ---
    const sendEmail = async (options) => {
        const transporter = nodemailer.createTransport({
            service: 'Gmail', // Or your preferred service
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS, // Use App Password for Gmail
            },
        });

        const mailOptions = {
            from: `"Mapped Support" <${process.env.EMAIL_USER}>`,
            to: options.email,
            subject: options.subject,
            html: options.html,
        };

        await transporter.sendMail(mailOptions);
    };

    // 1. REGISTER (Email/Password) - Only store name, email, password
    router.post('/register', asyncHandler(async (req, res, next) => {
        const { name, email, password } = req.body; 

        try {
            let user = await User.findOne({ email });

            if (user) {
                return res.status(400).json({ 
                    success: false,
                    msg: 'User already exists' 
                });
            }

            // Only store name, email, password
            user = new User({ 
                name, 
                email, 
                password
                // Don't set registrationMethod here if it's not needed
                // Let the model defaults handle it
            });
            await user.save();
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, email: user.email },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );
            
            return res.status(201).json({ 
                success: true,
                msg: 'User registered successfully', 
                token: token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    // Only return what's needed
                }
            });
            
        } catch (err) {
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    success: false,
                    msg: 'Validation Error', 
                    errors: Object.values(err.errors).map(e => e.message) 
                });
            }
            
            if (err.code === 11000) {
                return res.status(400).json({ 
                    success: false,
                    msg: 'Email already exists' 
                });
            }
            
            next(err); 
        }
    }));

    // 2. LOGIN (Email/Password)
    router.post('/login', asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        try {
            const user = await User.findOne({ email });

            if (!user) {
                return res.status(400).json({ 
                    success: false,
                    msg: 'Invalid Credentials' 
                });
            }

            const isMatch = await user.verifyPassword(password);

            if (!isMatch) {
                return res.status(400).json({ 
                    success: false,
                    msg: 'Invalid Credentials' 
                });
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, email: user.email },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );

            res.json({ 
                success: true,
                msg: 'Login successful', 
                token: token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    isBlocked: user.isBlocked
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ 
                success: false,
                msg: 'Server error',
                error: err.message 
            });
        }    
    }));

    // 3. GET ALL USERS
    router.get('/', asyncHandler(async (req, res) => {
        try {
            const users = await User.find({}).select('-password'); 
            res.json({
                success: true,
                data: users
            });
        } catch (err) {
            console.error('Get users error:', err);
            res.status(500).json({ 
                success: false,
                msg: 'Server error',
                error: err.message 
            });
        }        
    }));

    // 4. GOOGLE REGISTER/LOGIN - Simplified: only store name, email, googleId
    router.post('/google-register', asyncHandler(async (req, res) => {
        try {
            const { uid, email, name, photoUrl } = req.body;

            console.log('📱 Google Registration Request:', { uid, email, name });

            // Check if user already exists by email
            let user = await User.findOne({ email });

            if (user) {
                // User exists, check if they have Google ID
                if (user.googleId && user.googleId !== uid) {
                    return res.status(400).json({
                        success: false,
                        message: 'This email is already registered with a different Google account'
                    });
                }

                // Update user with Google ID if not already set
                if (!user.googleId) {
                    user.googleId = uid;
                    await user.save();
                }
                
                console.log('✅ User exists, logging in with Google:', email);
            } else {
                // Create new user with minimal info: name, email, googleId
                user = new User({
                    name: name || email.split('@')[0],
                    email,
                    googleId: uid,
                    // No password needed for Google users
                    password: '' // Your model might require this, so set empty or handle in model
                });

                await user.save();
                console.log('✅ New Google user created:', email);
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, email: user.email },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );

            res.status(200).json({
                success: true,
                message: 'Google authentication successful',
                token: token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                    // Don't return googleId to client for security
                }
            });

        } catch (error) {
            console.error('❌ Google registration error:', error);
            
            // Handle duplicate Google ID
            if (error.code === 11000 && error.keyPattern && error.keyPattern.googleId) {
                return res.status(400).json({
                    success: false,
                    message: 'This Google account is already linked to another user'
                });
            }
            
            // Handle duplicate email
            if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
                return res.status(400).json({
                    success: false,
                    message: 'This email is already registered'
                });
            }
            
            // Handle validation errors
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Validation Error',
                    errors: Object.values(error.errors).map(e => e.message)
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Server error during Google registration',
                error: error.message
            });
        }
    }));

    // 5. FORGOT PASSWORD
    router.post('/forgot-password', asyncHandler(async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, msg: 'Email is required' });

        // Removed .toLowerCase() - Ensure your database search matches the stored format
        const user = await User.findOne({ email: email });
        if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

        // Generate a 4-digit numeric OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        user.resetPasswordToken = otp;
        user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        try {
            await sendEmail({
                email: user.email,
                subject: 'Your Password Reset Code',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px;">
                        <h2 style="color: #333;">Password Reset Request</h2>
                        <p>Use the following 4-digit code to reset your password. Valid for 10 minutes.</p>
                        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4CAF50; text-align: center; padding: 20px; background: #f9f9f9;">
                            ${otp}
                        </div>
                    </div>
                `
            });
            res.json({ success: true, msg: 'Code sent to email' });
        } catch (error) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            res.status(500).json({ success: false, msg: 'Email could not be sent' });
        }
    }));

    // 6. VERIFY OTP
    router.post('/verify-otp', asyncHandler(async (req, res) => {
        let { email, otp } = req.body;

        // FIX: Extract email if it was sent as an object from Flutter
        const emailString = typeof email === 'object' ? email.email : email;

        const user = await User.findOne({
            email: emailString,
            resetPasswordToken: otp,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ success: false, msg: 'Invalid or expired code' });

        res.json({ success: true, msg: 'Code verified successfully' });
    }));

    // 7. RESET PASSWORD
    router.post('/reset-password', asyncHandler(async (req, res) => {
        let { email, otp, newPassword } = req.body;

        // FIX: Extract email if it was sent as an object from Flutter
        const emailString = typeof email === 'object' ? email.email : email;

        const user = await User.findOne({
            email: emailString,
            resetPasswordToken: otp,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ success: false, msg: 'Session expired or invalid code' });

        user.password = newPassword; 
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true, msg: 'Password reset successful' });
    }));

    return router;
};