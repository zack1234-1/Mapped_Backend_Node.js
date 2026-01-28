const express = require('express');
const Progress = require('../models/progress');

const TOTAL_POOMSAE_COUNT = 8;

module.exports = (asyncHandler) => {
    const router = express.Router();

    // ==========================================
    // 1. POST /api/progress - Save/Update Progress inside the Array
    // ==========================================
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== PROGRESS SAVE REQUEST (Combined) ===');
        const { traineeId, poomsae, techniques, kicks } = req.body;

        if (!traineeId || !poomsae) {
            return res.status(400).json({ success: false, msg: 'Trainee ID and Poomsae are required' });
        }

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
            poomsae: poomsae,
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
                // CASE B: Trainee exists. Check if this specific Poomsae exists in the array.
                const formIndex = progressDoc.forms.findIndex(f => f.poomsae === poomsae);

                if (formIndex > -1) {
                    // Update existing form in the array
                    progressDoc.forms[formIndex] = { ...progressDoc.forms[formIndex].toObject(), ...newFormData };
                } else {
                    // Add new form to the array
                    progressDoc.forms.push(newFormData);
                }
            }

            // ======================================================
            // === NEW: Calculate and Store Overall Average ===
            // ======================================================
            // if (progressDoc.forms && progressDoc.forms.length > 0) {
            //     const totalPercent = progressDoc.forms.reduce((sum, form) => sum + (form.percentage || 0), 0);
            //     progressDoc.overallAverage = totalPercent / progressDoc.forms.length;
            // } else {
            //     progressDoc.overallAverage = 0.0;
            // }
            // if (progressDoc.forms && progressDoc.forms.length > 0) {
            //     let globalTotalScore = 0;
            //     let globalMaxPossible = 0;

            //     progressDoc.forms.forEach(form => {
            //         // 1. Add User's Score
            //         globalTotalScore += (form.totalScore || 0);

            //         // 2. Calculate Max Points for this specific form
            //         // Check if properties exist and get their size/length
            //         let techCount = 0;
            //         let kickCount = 0;

            //         // Handle Mongoose Map or standard Object
            //         if (form.techniques) {
            //             // If it's a Mongoose Map, use .size, otherwise Object.keys
            //             techCount = (form.techniques instanceof Map) ? form.techniques.size : Object.keys(form.techniques).length;
            //         }
            //         if (form.kicks) {
            //              kickCount = (form.kicks instanceof Map) ? form.kicks.size : Object.keys(form.kicks).length;
            //         }

            //         const formMaxScore = (techCount + kickCount) * 2;
            //         globalMaxPossible += formMaxScore;
            //     });

            //     // 3. Final Division
            //     if (globalMaxPossible > 0) {
            //         progressDoc.overallAverage = globalTotalScore / globalMaxPossible;
            //     } else {
            //         progressDoc.overallAverage = 0.0;
            //     }
            // } else {
            //     progressDoc.overallAverage = 0.0;
            // }

            // ======================================================
            // === FIXED: Curriculum Average Calculation ===
            // ======================================================
            if (progressDoc.forms && progressDoc.forms.length > 0) {
                let sumPercentages = 0;

                // Sum up percentages of all saved forms
                progressDoc.forms.forEach(form => {
                    sumPercentages += (form.percentage || 0);
                });

                // Divide by the fixed total count (8), treating missing forms as 0%
                progressDoc.overallAverage = sumPercentages / TOTAL_POOMSAE_COUNT;

                // Safety Cap
                if (progressDoc.overallAverage > 1) progressDoc.overallAverage = 1;
            } else {
                progressDoc.overallAverage = 0.0;
            }
            // ======================================================

            await progressDoc.save();

            console.log(`✅ Combined Progress saved. Form: ${poomsae}, Form Score: ${(percentage*100).toFixed(0)}%, Overall Avg: ${(progressDoc.overallAverage*100).toFixed(0)}%`);

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
    // 2. GET /api/progress/:traineeId/:poomsae 
    // ==========================================
    router.get('/:traineeId/:poomsae', asyncHandler(async (req, res) => {
        const { traineeId, poomsae } = req.params;
        const decodedPoomsae = decodeURIComponent(poomsae);

        try {
            // Find the big document
            const progressDoc = await Progress.findOne({ trainee: traineeId });

            if (!progressDoc) {
                return res.status(200).json({
                    success: true,
                    data: { percentage: 0, techniques: {}, kicks: {} }
                });
            }

            // Find the specific form inside the array
            const specificForm = progressDoc.forms.find(f => f.poomsae === decodedPoomsae);

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
                    data: [] // Return empty list
                });
            }

            // Return all forms so frontend can calculate average
            res.status(200).json({
                success: true,
                data: progressDoc.forms
            });

        } catch (err) {
            console.error('Fetch All Progress Error:', err);
            res.status(500).json({ success: false, msg: 'Server Error' });
        }
    }));

    return router;
};