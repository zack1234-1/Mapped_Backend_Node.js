const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// 1. CONFIGURE STORAGE (Memory storage for Cloudinary)
const storage = multer.memoryStorage();

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
    limits: { fileSize: 1024 * 1024 * 2 }, // 2MB limit for profile pictures
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
            try {
                // Delete old avatar from Cloudinary if exists
                if (user.avatar && user.avatar.includes('cloudinary')) {
                    try {
                        const urlParts = user.avatar.split('/');
                        const fileName = urlParts[urlParts.length - 1];
                        const publicId = `users/${fileName.split('.')[0]}`;
                        await cloudinary.uploader.destroy(publicId);
                        console.log('✅ Old avatar deleted from Cloudinary:', publicId);
                    } catch (deleteError) {
                        console.error('⚠️  Error deleting old avatar:', deleteError);
                    }
                }

                // Upload new avatar to Cloudinary
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: 'users' },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });

                user.avatar = uploadResult.secure_url;
                console.log('✅ New avatar uploaded to Cloudinary:', user.avatar);
            } catch (cloudinaryError) {
                console.error('❌ Cloudinary upload error:', cloudinaryError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Avatar upload failed', 
                    error: cloudinaryError.message 
                });
            }
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

        try {
            // Delete old avatar from Cloudinary if exists
            if (user.avatar && user.avatar.includes('cloudinary')) {
                try {
                    const urlParts = user.avatar.split('/');
                    const fileName = urlParts[urlParts.length - 1];
                    const publicId = `users/${fileName.split('.')[0]}`;
                    await cloudinary.uploader.destroy(publicId);
                    console.log('✅ Old avatar deleted from Cloudinary:', publicId);
                } catch (deleteError) {
                    console.error('⚠️  Error deleting old avatar:', deleteError);
                }
            }

            // Upload new avatar to Cloudinary
            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'users' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                uploadStream.end(req.file.buffer);
            });

            user.avatar = uploadResult.secure_url;
            console.log('✅ Avatar uploaded to Cloudinary:', user.avatar);
            await user.save();

            const updatedUser = await User.findById(req.params.id).select('-password');

            res.json({ 
                success: true,
                msg: 'Photo updated successfully', 
                avatar: updatedUser.avatar,
                user: updatedUser 
            });
        } catch (cloudinaryError) {
            console.error('❌ Cloudinary upload error:', cloudinaryError);
            return res.status(500).json({ 
                success: false, 
                message: 'Avatar upload failed', 
                error: cloudinaryError.message 
            });
        }

    } catch (err) {
        console.error('Upload picture error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;