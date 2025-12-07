const express = require('express');
const Trainee = require('../models/trainee');

// Helper function to capitalize the first letter and lowercase the rest (Title Case)
const toTitleCase = (str) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};


// NEW HELPER: Formats date to YYYY-MM-DD using LOCAL TIME (Fixes the -1 day bug)
const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    // This gets the year, month, and day based on your server's/laptop's timezone
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

module.exports = (asyncHandler) => {
    const router = express.Router();

    // POST /api/trainee - Create new trainee
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== TRAINEE CREATE REQUEST START ===');
        console.log('📥 Received request body:', req.body);

        let { // Use 'let' because we will reassign belt and gender
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
            image
        } = req.body;

        // 1. Validate required fields
        if (!name || !belt || !dateOfBirth || !gender || !phone || !email || !address || !guardianName || !guardianContact || !guardianAddress) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                msg: 'All fields are required'
            });
        }

        // 2. APPLY CASE FIX: Convert belt and gender to Title Case for Mongoose validation
        belt = toTitleCase(belt);
        gender = toTitleCase(gender);

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
                image: image || null
            });

            console.log('3. Trainee object created:', trainee);

            console.log('4. Saving trainee to database...');
            await trainee.save();
            
            console.log('✅ Trainee saved successfully with ID:', trainee._id);
            
            return res.status(201).json({ 
                success: true,
                msg: 'Trainee added successfully',
                data: {
                    id: trainee._id,
                    name: trainee.name,
                    email: trainee.email,
                    belt: trainee.belt,
                    dateOfBirth: formatDate(trainee.dateOfBirth), // <--- MODIFIED HERE
                    gender: trainee.gender
                }
            });
            
        } catch (err) {
            console.error('💥 ERROR in trainee creation:');
            console.error('Error name:', err.name);
            console.error('Error message:', err.message);
            console.error('Error stack:', err.stack);
            
            // Handle different types of errors
            if (err.name === 'ValidationError') {
                const errors = Object.values(err.errors).map(e => e.message);
                console.error('Validation errors:', errors);
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

    // --- REST OF THE ROUTES (GET, PUT, DELETE) ---

    // GET /api/trainee - Get all trainees
    router.get('/', asyncHandler(async (req, res) => {
        console.log('📥 GET request for all trainees');
        
        try {
            // Added .lean() to convert Mongoose Docs to plain JS objects so we can modify dateOfBirth
            const trainees = await Trainee.find({})
                .sort({ createdAt: -1 })
                .select('-__v')
                .lean(); 
            
            console.log(`✅ Found ${trainees.length} trainees`);

            // Map results to format date
            const formattedTrainees = trainees.map(t => ({
                ...t,
                id: t._id,
                dateOfBirth: formatDate(t.dateOfBirth) // <--- MODIFIED HERE
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
    router.put('/:id', asyncHandler(async (req, res) => {
        const traineeId = req.params.id;
        console.log('📥 PUT request for trainee ID:', traineeId);
        console.log('Update data:', req.body);
        
        // 3. APPLY CASE FIX: Format belt and gender in the update body if present
        if (req.body.belt) {
            req.body.belt = toTitleCase(req.body.belt);
        }
        if (req.body.gender) {
            req.body.gender = toTitleCase(req.body.gender);
        }

        try {
            // Check if email is being updated and if it already exists
            if (req.body.email) {
                req.body.email = req.body.email.toLowerCase(); // Ensure email is lowercased for check
                
                const existingTrainee = await Trainee.findOne({ 
                    email: req.body.email,
                    _id: { $ne: traineeId } // Exclude current trainee
                });
                
                if (existingTrainee) {
                    console.log('❌ Email already exists:', req.body.email);
                    return res.status(400).json({ 
                        success: false,
                        msg: 'Email already exists' 
                    });
                }
            }
            
            // Added .lean()
            const trainee = await Trainee.findByIdAndUpdate(
                traineeId,
                req.body,
                { 
                    new: true, // Return updated document
                    runValidators: true // Run model validations (important for belt/gender fix)
                }
            ).select('-__v').lean();
            
            if (!trainee) {
                console.log('❌ Trainee not found with ID:', traineeId);
                return res.status(404).json({
                    success: false,
                    msg: 'Trainee not found'
                });
            }

            // Format updated trainee date
            const formattedTrainee = {
                ...trainee,
                id: trainee._id,
                dateOfBirth: formatDate(trainee.dateOfBirth) // <--- MODIFIED HERE
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

    // DELETE /api/trainee/:id - Delete trainee
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