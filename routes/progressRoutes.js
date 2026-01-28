
const express = require('express');
const Progress = require('../models/progress');

module.exports = (asyncHandler) => {
    const router = express.Router();
    const TOTAL_FORM_COUNT = 8;

    // ==========================================
    // 1. POST /api/progress - Save/Update Progress inside the Array
    // ==========================================
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== PROGRESS SAVE REQUEST (Combined) ===');
        
        // Destructure mutable variables
        let { traineeId, form, techniques, kicks } = req.body;

        if (!traineeId || !form) {
            return res.status(400).json({ success: false, msg: 'Trainee ID and Form are required' });
        }

        // --- CRITICAL FIX: Trim form name to prevent duplicates ---
        // This ensures "Pattern 2 " becomes "Pattern 2" so it matches the existing DB entry.
        form = form.trim();

        // --- CALCULATION LOGIC ---
        let currentScore = 0;
        let totalItems = 0;

        if (techniques) {
            Object.values(techniques).forEach(val => {
                currentScore += parseInt(val || 0);
                totalItems++;
            });
        }
        if (kicks) {
            Object.values(kicks).forEach(val => {
                currentScore += parseInt(val || 0);
                totalItems++;
            });
        }

        const maxPossibleScore = totalItems * 2;
        const percentage = totalItems > 0 ? (currentScore / maxPossibleScore) : 0;

        // The new form data object
        const newFormData = {
            form: form,
            techniques: techniques,
            kicks: kicks,
            totalScore: currentScore,
            percentage: percentage
        };

        try {
            // 1. Check if a document exists for this trainee
            let progressDoc = await Progress.findOne({ trainee: traineeId });

            if (!progressDoc) {
                // CASE A: Trainee has no progress record yet. Create new Doc.
                progressDoc = new Progress({
                    trainee: traineeId,
                    forms: [newFormData]
                });
            } else {
                // CASE B: Trainee exists. Check if this specific Form exists in the array.
                // Because we trimmed 'form' above, this will now correctly find the existing entry.
                const formIndex = progressDoc.forms.findIndex(f => f.form === form);

                if (formIndex > -1) {
                    // Update existing form in the array
                    // We merge existing data with new data to preserve _id if needed, though usually subdoc replacement is fine
                    progressDoc.forms[formIndex] = { ...progressDoc.forms[formIndex].toObject(), ...newFormData };
                } else {
                    // Add new form to the array
                    progressDoc.forms.push(newFormData);
                }
            }

            // ======================================================
            // === FIXED: Curriculum Average Calculation ===
            // ======================================================
            if (progressDoc.forms && progressDoc.forms.length > 0) {
                let sumPercentages = 0;

                // Sum up percentages of all saved forms
                progressDoc.forms.forEach(formItem => {
                    sumPercentages += (formItem.percentage || 0);
                });

                // Divide by the fixed total count (8), treating missing forms as 0%
                progressDoc.overallAverage = sumPercentages / TOTAL_FORM_COUNT;

                // Safety Cap
                if (progressDoc.overallAverage > 1) progressDoc.overallAverage = 1;
            } else {
                progressDoc.overallAverage = 0.0;
            }
            // ======================================================

            await progressDoc.save();

            console.log(`✅ Combined Progress saved. Form: "${form}", Form Score: ${(percentage*100).toFixed(0)}%, Overall Avg: ${(progressDoc.overallAverage*100).toFixed(0)}%`);

            res.status(200).json({
                success: true,
                msg: 'Progress saved successfully',
                data: newFormData // Return just the form data so frontend behaves normally
            });

        } catch (err) {
            console.error('💥 Progress Save Error:', err);
            next(err);
        }
    }));

    // ==========================================
    // 2. GET /api/progress/:traineeId/:form 
    // ==========================================
    router.get('/:traineeId/:form', asyncHandler(async (req, res) => {
        const { traineeId, form } = req.params;
        
        // --- CRITICAL FIX: Trim the decoded form name ---
        // Frontend sends encoded "Pattern%202%20", we decode then trim to "Pattern 2"
        const decodedForm = decodeURIComponent(form).trim();

        try {
            // Find the big document
            const progressDoc = await Progress.findOne({ trainee: traineeId });

            if (!progressDoc) {
                return res.status(200).json({
                    success: true,
                    data: { percentage: 0, techniques: {}, kicks: {} }
                });
            }

            // Find the specific form inside the array using the trimmed name
            const specificForm = progressDoc.forms.find(f => f.form === decodedForm);

            if (!specificForm) {
                return res.status(200).json({
                    success: true,
                    data: { percentage: 0, techniques: {}, kicks: {} }
                });
            }

            // Return JUST the specific form data, so Flutter doesn't get confused
            res.status(200).json({
                success: true,
                data: specificForm
            });

        } catch (err) {
            console.error('Fetch Progress Error:', err);
            res.status(500).json({ success: false, msg: 'Server Error' });
        }
    }));

    // ==========================================
    // 3. GET /api/progress/:traineeId - Get ALL forms for calculation
    // ==========================================
    router.get('/:traineeId', asyncHandler(async (req, res) => {
        const { traineeId } = req.params;

        try {
            const progressDoc = await Progress.findOne({ trainee: traineeId });

            if (!progressDoc || !progressDoc.forms || progressDoc.forms.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: {
                    forms: [],
                    overallAverage: 0.0 // Default to 0
                }
                });
            }

            // Return all forms so frontend can calculate average
            res.status(200).json({
                success: true,
                data: {
                forms: progressDoc.forms,
                overallAverage: progressDoc.overallAverage || 0.0 
            }
            });

        } catch (err) {
            console.error('Fetch All Progress Error:', err);
            res.status(500).json({ success: false, msg: 'Server Error' });
        }
    }));

    return router;
};