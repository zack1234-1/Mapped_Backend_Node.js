
const express = require('express');
const Progress = require('../models/progress');

module.exports = (asyncHandler) => {
    const router = express.Router();
    const TOTAL_FORM_COUNT = 8;
    
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== PROGRESS SAVE REQUEST (Combined) ===');
        
        // Destructure mutable variables
        let { traineeId, beltColor, form, techniques, kicks } = req.body;

        if (!traineeId || !beltColor || !form) {
            return res.status(400).json({ success: false, msg: 'Trainee ID, Belt Color, and Form are required' });
        }

        // --- CRITICAL FIX: Trim form name and beltColor to prevent duplicates ---
        form = form.trim();
        beltColor = beltColor.trim();

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
        let percentage = totalItems > 0 ? (currentScore / maxPossibleScore) : 0;

        // Fix percentage to 2 decimal places
        percentage = parseFloat(percentage.toFixed(2));

        // The new form data object
        const newFormData = {
            form: form,
            techniques: techniques,
            kicks: kicks,
            totalScore: currentScore,
            percentage: percentage
        };

                try {
            // Find the progress document for this trainee
            let progressDoc = await Progress.findOne({ trainee: traineeId });

            if (!progressDoc) {
                // No progress record yet, create new
                progressDoc = new Progress({
                    trainee: traineeId,
                    beltColor: beltColor,
                    forms: [newFormData],
                    overallAverage: parseFloat((percentage / TOTAL_FORM_COUNT).toFixed(2)) // <-- FIXED
                });
            } else {
                // If beltColor has changed, reset forms and overallAverage
                if (progressDoc.beltColor !== beltColor) {
                    progressDoc.beltColor = beltColor;
                    progressDoc.forms = [newFormData];
                    progressDoc.overallAverage = parseFloat((percentage / TOTAL_FORM_COUNT).toFixed(2)); // <-- FIXED
                } else {
                    // Update or add form as usual
                    const formIndex = progressDoc.forms.findIndex(f => f.form === form);
                    if (formIndex > -1) {
                        progressDoc.forms[formIndex] = { ...progressDoc.forms[formIndex].toObject(), ...newFormData };
                    } else {
                        progressDoc.forms.push(newFormData);
                    }
                    // Recalculate average
                    let sumPercentages = 0;
                    progressDoc.forms.forEach(formItem => {
                        sumPercentages += (formItem.percentage || 0);
                    });
                    progressDoc.overallAverage = parseFloat((sumPercentages / TOTAL_FORM_COUNT).toFixed(2));
                    if (progressDoc.overallAverage > 1) progressDoc.overallAverage = 1;
                }
            }

            await progressDoc.save();

        // try {
        //     // Find the progress document for this trainee
        //     let progressDoc = await Progress.findOne({ trainee: traineeId });

        //     if (!progressDoc) {
        //         // No progress record yet, create new
        //         progressDoc = new Progress({
        //             trainee: traineeId,
        //             beltColor: beltColor,
        //             forms: [newFormData],
        //             overallAverage: percentage
        //         });
        //     } else {
        //         // If beltColor has changed, reset forms and overallAverage
        //         if (progressDoc.beltColor !== beltColor) {
        //             progressDoc.beltColor = beltColor;
        //             progressDoc.forms = [newFormData];
        //             progressDoc.overallAverage = percentage;
        //         } else {
        //             // Update or add form as usual
        //             const formIndex = progressDoc.forms.findIndex(f => f.form === form);
        //             if (formIndex > -1) {
        //                 progressDoc.forms[formIndex] = { ...progressDoc.forms[formIndex].toObject(), ...newFormData };
        //             } else {
        //                 progressDoc.forms.push(newFormData);
        //             }
        //             // Recalculate average
        //             let sumPercentages = 0;
        //             progressDoc.forms.forEach(formItem => {
        //                 sumPercentages += (formItem.percentage || 0);
        //             });
        //             progressDoc.overallAverage = sumPercentages / TOTAL_FORM_COUNT;
        //             if (progressDoc.overallAverage > 1) progressDoc.overallAverage = 1;
        //         }
        //     }

        //     await progressDoc.save();

            console.log(`✅ Progress saved. Belt: "${beltColor}", Form: "${form}", Form Score: ${(percentage*100).toFixed(0)}%, Overall Avg: ${(progressDoc.overallAverage*100).toFixed(0)}%`);

            res.status(200).json({
                success: true,
                msg: 'Progress saved successfully',
                data: newFormData
            });

        } catch (err) {
            console.error('💥 Progress Save Error:', err);
            next(err);
        }
    }));

    // ==========================================
    // 2. GET /api/progress/:traineeId/:form 
    // ==========================================
    // GET /api/progress/:traineeId/:beltColor/:form
    router.get('/:traineeId/:beltColor/:form', asyncHandler(async (req, res) => {
        const { traineeId, beltColor, form } = req.params;
        const decodedForm = decodeURIComponent(form).trim();
        const decodedBeltColor = decodeURIComponent(beltColor).trim();

        try {
            // Find the document for this trainee and belt color
            const progressDoc = await Progress.findOne({ trainee: traineeId, beltColor: decodedBeltColor });

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
    // GET /api/progress/:traineeId/:beltColor - Get ALL forms for a belt color
    router.get('/:traineeId/:beltColor', asyncHandler(async (req, res) => {
        const { traineeId, beltColor } = req.params;
        const decodedBeltColor = decodeURIComponent(beltColor).trim();

        try {
            const progressDoc = await Progress.findOne({ trainee: traineeId, beltColor: decodedBeltColor });

            if (!progressDoc || !progressDoc.forms || progressDoc.forms.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: {
                        forms: [],
                        overallAverage: 0.0
                    }
                });
            }

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

        // ==========================================
    // 4. DELETE /api/progress/:traineeId - Delete all progress for a trainee
    // ==========================================
    router.delete('/:traineeId', asyncHandler(async (req, res) => {
        const { traineeId } = req.params;
        try {
           
            const result = await Progress.deleteMany({ trainee: traineeId });
            
            console.log(`🗑️ Progress deleted for trainee: ${traineeId}. Count: ${result.deletedCount}`);

            res.status(200).json({ 
                success: true, 
                msg: 'Progress deleted successfully',
                deletedCount: result.deletedCount 
            });

        } catch (err) {
            console.error('Delete Progress Error:', err);
            res.status(500).json({ success: false, msg: 'Server Error' });
        }
    }));

    return router;
};