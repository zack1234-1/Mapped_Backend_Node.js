const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. CONFIGURE STORAGE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        cb(null, 'uploads/users/');
    },
    filename: (req, file, cb) => {
        // Rename: "user-ID-Timestamp.ext"
        cb(null, `user-${req.params.id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// 2. UPDATED FILE FILTER (Now with Debugging!)
const fileFilter = (req, file, cb) => {
    // DEBUG: Print the incoming file type to your VS Code Terminal
    console.log(`[Multer] Uploading file: ${file.originalname}`);
    console.log(`[Multer] Detected MimeType: ${file.mimetype}`);

    const allowedTypes = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp',   // Added support for WebP (common on Web)
        'image/heic',   // Added support for HEIC (common on iPhone)
        'application/octet-stream' // Sometimes Flutter sends this for generic binaries
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Rejecting
        cb(new Error(`Invalid file type: ${file.mimetype}. Only JPG, PNG, and WebP are allowed.`), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 10 }, // Increased limit to 10MB
    fileFilter: fileFilter
});

// --- ROUTES ---
// GET PROFILE
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// UPDATE PROFILE
router.put('/:id', async (req, res) => {
    const { name, username, phone, country, gender, address } = req.body;
    const profileFields = {};
    if (name) profileFields.name = name;
    if (username) profileFields.username = username;
    if (phone) profileFields.phone = phone;
    if (country) profileFields.country = country;
    if (gender) profileFields.gender = gender;
    if (address) profileFields.address = address;

    try {
        let user = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: profileFields },
            { new: true } 
        ).select('-password');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// UPLOAD PICTURE (Use /picture to match your previous setup)
router.put('/picture/:id', upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        const avatarUrl = req.file.path.replace(/\\/g, "/"); 

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { avatar: avatarUrl },
            { new: true }
        ).select('-password');

        res.json({ 
            msg: 'Photo updated successfully', 
            avatar: user.avatar,
            user: user 
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send(err.message);
    }
});

module.exports = router;