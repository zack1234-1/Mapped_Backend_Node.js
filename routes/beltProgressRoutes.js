const express = require('express');
const BeltProgressRing = require('../models/beltProgressRing');
const Trainee = require('../models/trainee');
const Progress = require('../models/progress');

module.exports = (asyncHandler) => {
    const router = express.Router();

    router.get('/', asyncHandler(async (req, res) => {
        const belts = ['White', 'Yellow', 'Green', 'Blue', 'Brown', 'Black'];
        const results = [];

        const DEBUG_TRAINEE_NAME = 'yong';

        

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
    // 1. Prefer the saved Overall Average
    if (doc.overallAverage !== undefined && doc.overallAverage !== null) {
        traineeScore = doc.overallAverage;
    } 
    // 2. Fallback Calculation
    else if (doc.forms && doc.forms.length > 0) {
        const totalFormPct = doc.forms.reduce((sum, f) => sum + (f.percentage || 0), 0);
        
        // --- FIX: Divide by 8 (Total Forms), not forms.length ---
        // Ideally, import TOTAL_FORM_COUNT from a constant file
        const TOTAL_FORM_COUNT = 8; 
        traineeScore = (totalFormPct / TOTAL_FORM_COUNT);
    }
}

                    // // Debug Log for Brown Belt
                    // if (traineeScore > 1.0) traineeScore = 1.0;

                    // const nameMatch = DEBUG_TRAINEE_NAME === '' || t.name.toLowerCase().includes(DEBUG_TRAINEE_NAME.toLowerCase());
                    
                    // if (nameMatch) {
                    //     console.log(`\n🔎 CHECKING: ${t.name} (${belt} Belt)`);
                    //     if (doc) {
                    //          console.log(`   ✅ FOUND PROGRESS DOC`);
                    //          console.log(`      Forms Saved: ${doc.forms ? doc.forms.length : 0}`);
                    //          console.log(`      OverallAvg (DB): ${(doc.overallAverage * 100).toFixed(1)}%`);
                    //          console.log(`      Final Score Used: ${(traineeScore * 100).toFixed(1)}%`);
                    //     } else {
                    //          console.log(`   ❌ NO PROGRESS DOC FOUND`);
                    //          console.log(`      (This is normal if the student hasn't been graded yet)`);
                    //     }
                    // }
                    // // --------------------------------

                    sumOfProgress += traineeScore;
                }

                // 4. Calculate Average
                const rawAvg = sumOfProgress / totalTrainees;
                beltAverage = Math.round(rawAvg * 100);;
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