const express = require('express');
const Trainee = require('../models/trainee');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

const toTitleCase = (str) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};


const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

module.exports = (asyncHandler) => {
    const router = express.Router();

    // POST /api/trainee - Create new trainee
    router.post('/', upload.single('image'), asyncHandler(async (req, res, next) => {
        console.log('=== TRAINEE CREATE REQUEST START ===');
        console.log('📥 Received request body:', req.body);
        if (req.file) console.log('📁 Received file:', req.file.originalname);

        let { 
            trainerId,
            name,
            belt,
            dateOfBirth,
            gender,
            phone,
            email,
            address,
            guardianName,
            guardianContact,
            guardianAddress,
            image,
            goals,
            conditions,
            competency
        } = req.body;

        if (!trainerId || !name || !belt || !dateOfBirth || !gender || !phone || !email || !address || !guardianName || !guardianContact || !guardianAddress) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                msg: 'All fields are required'
            });
        }

        belt = toTitleCase(belt);
        gender = toTitleCase(gender);
        if (req.file) {
            try {
                console.log('☁️ Uploading image to Cloudinary (Stream)...');
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { 
                            folder: 'trainees',
                            use_filename: true,
                            unique_filename: false
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });
                
                console.log('✅ Cloudinary Upload Success:', uploadResult.secure_url);
                image = uploadResult.secure_url;
                
            } catch (uploadErr) {
                console.error('❌ Cloudinary Upload Failed:', uploadErr);
                return res.status(500).json({ success: false, msg: 'Image upload failed', error: uploadErr.message });
            }
        }

        try {
            console.log('1. Checking for existing trainee with email:', email);
            
            // Check if email already exists
            const existingTrainee = await Trainee.findOne({ email });
            if (existingTrainee) {
                console.log('❌ Trainee already exists with email:', email);
                return res.status(400).json({ 
                    success: false,
                    msg: 'Trainee with this email already exists' 
                });
            }

            console.log('2. Creating new trainee object');
            
            // Create new trainee
            const trainee = new Trainee({
                trainerId,
                name,
                belt, // Now using the formatted 'Belt'
                  dateOfBirth: new Date(formatDate(dateOfBirth)), 
                gender, // Now using the formatted 'Gender'
                phone,
                email: email.toLowerCase(),
                address,
                guardianName,
                guardianContact,
                guardianAddress,
                goals: goals || '',
                conditions: conditions || '',
                competency: competency || '',
                image: image || null
            });

            await trainee.save();
            
            
            return res.status(201).json({ 
                success: true,
                msg: 'Trainee added successfully',
                data: {
                    id: trainee._id,
                    name: trainee.name,
                    email: trainee.email,
                    belt: trainee.belt,
                    dateOfBirth: formatDate(trainee.dateOfBirth), 
                    gender: trainee.gender
                }
            });
            
        } catch (err) {
            
            if (err.name === 'ValidationError') {
                const errors = Object.values(err.errors).map(e => e.message);
                return res.status(400).json({ 
                    success: false,
                    msg: 'Validation Error', 
                    errors: errors
                });
            }
            
            if (err.code === 11000) {
                console.error('Duplicate key error for email');
                return res.status(400).json({ 
                    success: false,
                    msg: 'Email already exists' 
                });
            }
            
            if (err.name === 'CastError') {
                console.error('Cast error - invalid data type');
                return res.status(400).json({ 
                    success: false,
                    msg: 'Invalid data format' 
                });
            }
            
            console.error('Unhandled error type, passing to global error handler');
            next(err);
        } finally {
            console.log('=== TRAINEE CREATE REQUEST END ===');
        }
    }));

    router.get('/', asyncHandler(async (req, res) => {
        console.log('📥 GET request for all trainees');
        
        try {
            
            const trainees = await Trainee.find({})
                .sort({ createdAt: -1 })
                .select('-__v')
                .lean(); 
        

            const formattedTrainees = trainees.map(t => ({
                ...t,
                id: t._id,
                dateOfBirth: formatDate(t.dateOfBirth) 
            }));
            
            res.json({
                success: true,
                count: formattedTrainees.length,
                data: formattedTrainees
            });
        } catch (err) {
            console.error('💥 Error fetching trainees:', err);
            next(err);
        }
    }));

    // GET /api/trainee/:id - Get single trainee by ID
    router.get('/:id', asyncHandler(async (req, res) => {
        const traineeId = req.params.id;
        console.log('📥 GET request for trainee ID:', traineeId);
        
        try {
            // Added .lean()
            const trainee = await Trainee.findById(traineeId).select('-__v').lean();
            
            if (!trainee) {
                console.log('❌ Trainee not found with ID:', traineeId);
                return res.status(404).json({
                    success: false,
                    msg: 'Trainee not found'
                });
            }
            
            // Format single trainee date
            const formattedTrainee = {
                ...trainee,
                id: trainee._id,
                dateOfBirth: formatDate(trainee.dateOfBirth) // <--- MODIFIED HERE
            };

            console.log('✅ Trainee found:', trainee.name);
            res.json({
                success: true,
                data: formattedTrainee
            });
        } catch (err) {
            console.error('💥 Error fetching trainee:', err);
            
            if (err.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid trainee ID format'
                });
            }
            
            next(err);
        }
    }));

    // PUT /api/trainee/:id - Update trainee
    router.put('/:id', upload.single('image'), asyncHandler(async (req, res, next) => {
        const traineeId = req.params.id;
        console.log('📥 PUT request for trainee ID:', traineeId);
        console.log('Update data:', req.body);
        if (req.file) console.log('📁 Received file override:', req.file.originalname);

        // Handle Image Upload for Update
        if (req.file) {
            try {
                console.log('☁️ Uploading new image to Cloudinary (Stream)...');
                 const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { 
                            folder: 'trainees',
                            use_filename: true,
                            unique_filename: false
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });

                console.log('✅ Cloudinary Upload Success:', uploadResult.secure_url);
                req.body.image = uploadResult.secure_url;

            } catch (uploadErr) {
                console.error('❌ Cloudinary Upload Failed:', uploadErr);
                return res.status(500).json({ success: false, msg: 'Image upload failed', error: uploadErr.message });
            }
        }
        
        if (req.body.belt) {
            req.body.belt = toTitleCase(req.body.belt);
        }
        if (req.body.gender) {
            req.body.gender = toTitleCase(req.body.gender);
        }

        try {
            if (req.body.email) {
                req.body.email = req.body.email.toLowerCase(); 
                
                const existingTrainee = await Trainee.findOne({ 
                    email: req.body.email,
                    _id: { $ne: traineeId }
                });
                
                if (existingTrainee) {
                    console.log('❌ Email already exists:', req.body.email);
                    return res.status(400).json({ 
                        success: false,
                        msg: 'Email already exists' 
                    });
                }
            }
            
            let trainee = await Trainee.findByIdAndUpdate(
                traineeId,
                req.body,
                { 
                    new: true, 
                    runValidators: true 
                }
            ).select('-__v').lean();
            
            if (!trainee) {
                console.log('⚠️ Trainee not found in Trainee collection, trying User collection for ID:', traineeId);
                
                const user = await User.findByIdAndUpdate(
                    traineeId,
                    req.body,
                    { new: true, runValidators: false } 
                ).select('-password -__v').lean();

                if (user) {
                     console.log('✅ User updated successfully via Trainee route:', user.name);
                     return res.json({
                        success: true,
                        msg: 'User updated successfully',
                        data: {
                            ...user,
                            id: user._id,
                            dateOfBirth: user.dateOfBirth ? formatDate(user.dateOfBirth) : null
                        }
                    });
                }

                console.log('❌ Trainee/User not found with ID:', traineeId);
                return res.status(404).json({
                    success: false,
                    msg: 'Trainee not found'
                });
            }
            const formattedTrainee = {
                ...trainee,
                id: trainee._id,
                dateOfBirth: formatDate(trainee.dateOfBirth) 
            };
            
            console.log('✅ Trainee updated successfully:', trainee.name);
            res.json({
                success: true,
                msg: 'Trainee updated successfully',
                data: formattedTrainee
            });
        } catch (err) {
            console.error('💥 Error updating trainee:', err);
            
            if (err.name === 'ValidationError') {
                const errors = Object.values(err.errors).map(e => e.message);
                return res.status(400).json({ 
                    success: false,
                    msg: 'Validation Error', 
                    errors: errors
                });
            }
            
            if (err.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid trainee ID format'
                });
            }
            
            next(err);
        }
    }));

    router.delete('/:id', asyncHandler(async (req, res) => {
        const traineeId = req.params.id;
        console.log('📥 DELETE request for trainee ID:', traineeId);
        
        try {
            const trainee = await Trainee.findByIdAndDelete(traineeId);
            
            if (!trainee) {
                console.log('❌ Trainee not found with ID:', traineeId);
                return res.status(404).json({
                    success: false,
                    msg: 'Trainee not found'
                });
            }
            
            console.log('✅ Trainee deleted successfully:', trainee.name);
            res.json({
                success: true,
                msg: 'Trainee deleted successfully',
                data: {
                    id: trainee._id,
                    name: trainee.name,
                    email: trainee.email
                }
            });
        } catch (err) {
            console.error('💥 Error deleting trainee:', err);
            
            if (err.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid trainee ID format'
                });
            }
            
            next(err);
        }
    }));

    return router;
};