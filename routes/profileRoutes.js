const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. CONFIGURE STORAGE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/users';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, 'uploads/users/');
    },
    filename: (req, file, cb) => {
        cb(null, `user-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// 2. FILE FILTER
const fileFilter = (req, file, cb) => {
    console.log(`[Multer] Uploading file: ${file.originalname}`);
    console.log(`[Multer] Detected MimeType: ${file.mimetype}`);

    const allowedTypes = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp',
        'image/heic',
        'application/octet-stream'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only JPG, PNG, and WebP are allowed.`), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 10 }, // 10MB
    fileFilter: fileFilter
});

// GET PROFILE - Handle both _id and googleId
router.get('/:id', async (req, res) => {
    try {
        let user;
        
        // Check if it's a MongoDB ObjectId format (24 hex chars)
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            user = await User.findById(req.params.id).select('-password');
        } else {
            // Try searching by googleId or email
            user = await User.findOne({
                $or: [
                    { googleId: req.params.id },
                    { email: req.params.id }
                ]
            }).select('-password');
        }
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    } catch (err) {
        console.error('Profile fetch error:', err.message);
        res.status(500).json({ 
            success: false, 
            message: 'Server Error: ' + err.message 
        });
    }
});

// UPDATE PROFILE - NOW INCLUDES IMAGE UPLOAD
router.put('/:id', upload.single('avatar'), async (req, res) => {
    try {
        const { name, username, phone, country, gender, address } = req.body;
        
        console.log('=== Profile Update Request ===');
        console.log('User ID:', req.params.id);
        console.log('Body:', req.body);
        console.log('File:', req.file);
        
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        if (name) user.name = name;
        if (username) user.username = username;
        if (phone) user.phone = phone;
        if (country) user.country = country;
        if (gender) user.gender = gender;
        if (address) user.address = address;

        // Update avatar if uploaded
        if (req.file) {
            // Delete old avatar if exists
            if (user.avatar && fs.existsSync(user.avatar)) {
                try {
                    fs.unlinkSync(user.avatar);
                    console.log('✓ Old avatar deleted:', user.avatar);
                } catch (unlinkErr) {
                    console.error('✗ Error deleting old avatar:', unlinkErr);
                }
            }
            user.avatar = req.file.path.replace(/\\/g, "/");
            console.log('✓ New avatar saved:', user.avatar);
        }

        await user.save();
        
        // Return user without password
        const updatedUser = await User.findById(req.params.id).select('-password');
        
        console.log('✓ Profile updated successfully');
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedUser
        });
    } catch (err) {
        console.error('✗ Update profile error:', err.message);
        res.status(500).json({ 
            success: false, 
            message: 'Server Error: ' + err.message 
        });
    }
});

// LEGACY ENDPOINT - Keep for backward compatibility
// UPLOAD PICTURE (Separate endpoint if needed)
router.put('/picture/:id', upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                msg: 'No file uploaded' 
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        // Delete old avatar
        if (user.avatar && fs.existsSync(user.avatar)) {
            try {
                fs.unlinkSync(user.avatar);
            } catch (unlinkErr) {
                console.error('Error deleting old avatar:', unlinkErr);
            }
        }

        const avatarUrl = req.file.path.replace(/\\/g, "/");
        user.avatar = avatarUrl;
        await user.save();

        const updatedUser = await User.findById(req.params.id).select('-password');

        res.json({ 
            success: true,
            msg: 'Photo updated successfully', 
            avatar: updatedUser.avatar,
            user: updatedUser 
        });

    } catch (err) {
        console.error('Upload picture error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;