const express = require('express');
const BeltProgressRing = require('../models/beltProgressRing');
const Trainee = require('../models/trainee');
const Progress = require('../models/progress');

module.exports = (asyncHandler) => {
    const router = express.Router();

    router.get('/', asyncHandler(async (req, res) => {
        const belts = ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black'];
        const results = [];

        console.log('=== STARTING BELT CALCULATION (FIXED) ===');

        for (const belt of belts) {
            // 1. Find Trainees
            const trainees = await Trainee.find({ 
                belt: { $regex: new RegExp(`^${belt}`, 'i') } 
            }).lean();
            
            const totalTrainees = trainees.length;
            let beltAverage = 0;

            if (totalTrainees > 0) {
                const traineeIds = trainees.map(t => t._id);

                // 2. Find Progress Docs
                const progressDocs = await Progress.find({ 
                    trainee: { $in: traineeIds } 
                }).lean();

                const progressMap = {};
                progressDocs.forEach(doc => {
                    progressMap[doc.trainee.toString()] = doc;
                });

                let sumOfProgress = 0;

                // 3. Loop through Trainees
                for (let t of trainees) {
                    const tId = t._id.toString();
                    const doc = progressMap[tId];
                    
                    let traineeScore = 0;

                    if (doc) {
                        // === FIXED LOGIC HERE ===
                        // Check if we have a valid calculated average (> 0)
                        if (doc.overallAverage && doc.overallAverage > 0) {
                            traineeScore = doc.overallAverage;
                        } 
                        // Fallback: If overallAverage is 0 or missing, BUT we have forms, calculate manually
                        else if (doc.forms && doc.forms.length > 0) {
                            const totalFormPct = doc.forms.reduce((sum, f) => sum + (f.percentage || 0), 0);
                            traineeScore = (totalFormPct / doc.forms.length);
                        }
                    }

                    // Debug Log for Red Belt
                    if (belt === 'Red') {
                        console.log(`   -> Trainee: ${t.name} (${tId})`);
                        console.log(`      Forms Count: ${doc?.forms?.length || 0}`);
                        console.log(`      OverallAvg (DB): ${doc?.overallAverage}`);
                        console.log(`      Calculated Score: ${traineeScore}`);
                    }

                    sumOfProgress += traineeScore;
                }

                // 4. Calculate Average
                const rawAvg = sumOfProgress / totalTrainees;
                beltAverage = Math.round(rawAvg * 100);
            }

            // 5. Save
            const beltRingDoc = await BeltProgressRing.findOneAndUpdate(
                { beltName: belt },
                { 
                    averagePercentage: beltAverage,
                    traineeCount: totalTrainees
                },
                { new: true, upsert: true }
            );

            results.push(beltRingDoc);
        }

        res.status(200).json({
            success: true,
            data: results
        });
    }));

    return router;
};