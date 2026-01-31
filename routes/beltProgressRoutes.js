const express = require('express');
const BeltProgress = require('../models/beltProgress');
const Session = require('../models/session');
const User = require('../models/User'); // Corrected from 'trainee' to 'User'

// --- 1. CONSTANTS (MATCHING FRONTEND) ---
const BELT_SESSION_REQ = { 'W': 3, 'Y': 5, 'G': 8, 'B': 20, 'R': 20, 'L': 9999 };
const BELT_ACTIVE_DAY_REQ = { 'W': 3, 'Y': 5, 'G': 14, 'B': 30, 'R': 60, 'L': 9999 };

const BELT_ORDER = ['W', 'Y', 'G', 'B', 'R', 'L'];

// Helper to map Full Names to Codes
const getBeltCode = (input) => {
    if (!input) return null;
    const normalized = input.trim();
    const map = { 'White': 'W', 'Yellow': 'Y', 'Green': 'G', 'Blue': 'B', 'Brown': 'R', 'Black': 'L' };
    // Also support direct codes if passed
    if (Object.values(map).includes(normalized)) return normalized;
    if (map[normalized]) return map[normalized];
    

    return map[normalized] || normalized; 
};

// Helper: Distribute Totals
const distributeCountToBelts = (totalCount, requirements) => {
    let remaining = totalCount;
    const distribution = {};
    BELT_ORDER.forEach(code => {
        const req = requirements[code];
        const count = Math.min(Math.max(remaining, 0), req);
        distribution[code] = count;
        remaining -= req;
    });
    return distribution;
};

module.exports = (asyncHandler) => {
    const router = express.Router();

    router.post('/sync-belt', asyncHandler(async (req, res) => {
        const { userId, beltColor, planSessionCount, activeDayCount, progressPercentage, openResourceCount } = req.body;

        if (!userId || !beltColor) {
            return res.status(400).json({ success: false, msg: 'Missing required fields' });
        }

        const code = getBeltCode(beltColor)

       
        const existingDoc = await BeltProgress.findOne({ userId });
        const existingBelt = existingDoc && existingDoc.belts ? existingDoc.belts[code] : null;
       
        const currentData = existingBelt ? (existingBelt._doc || existingBelt) : {};

        const updateData = {};
        
        // Update Session Count if provided
        if (planSessionCount !== undefined) {
            updateData[`belts.${code}.planSessionCount`] = planSessionCount;
        }
        
        // Update Active Day Count if provided
        if (activeDayCount !== undefined) {
            updateData[`belts.${code}.activeDayCount`] = activeDayCount;
        }

       if (openResourceCount !== undefined) {
    // 1. Get current value from DB (Default to 0)
    const currentVal = currentData.openResourceCount || 0;
    const incomingVal = Number(openResourceCount);

    // 2. SAFETY LOCK: Only save if the new value is HIGHER.
    // This prevents the "Login Reset" bug where the app sends 0.
    if (incomingVal > currentVal) {
        updateData[`belts.${code}.openResourceCount`] = incomingVal;
        console.log(`[Sync] Updating openResourceCount to ${incomingVal}`);
    } else {
        console.log(`[Sync] Ignoring lower/equal value: ${incomingVal} (DB has ${currentVal})`);
    }
}

        if (progressPercentage !== undefined) {
            const roundedProgress = parseFloat(Number(progressPercentage).toFixed(2));
            updateData[`belts.${code}.progressPercentage`] = roundedProgress;
            
            if (roundedProgress >= 100) {
                updateData[`belts.${code}.isCompleted`] = true;
            }
        }


        const result = await BeltProgress.updateOne(
            { userId }, 
            { 
                $set: updateData,
                $setOnInsert: { userId } 
            },
            { upsert: true }
        );
 

        res.json({ 
            success: true, 
            msg: `Synced ${code} successfully`,
            data: { beltColor: code, planSessionCount, activeDayCount, progressPercentage, openResourceCount },
            receivedBody: req.body 
        });
    }));

    router.get('/', asyncHandler(async (req, res) => {
        const { userId } = req.query;
        console.log(`[GetBeltProgress] Fetching for userId=${userId}`);

        if (!userId) {
            return res.status(400).json({ success: false, msg: 'User ID is required' });
        }
        const totalSessions = await Session.countDocuments({ trainerId: userId });
        const distSessions = distributeCountToBelts(totalSessions, BELT_SESSION_REQ);

        let progressDoc = await BeltProgress.findOne({ userId }).lean();
        
        if (!progressDoc) {
             console.log(`[GetBeltProgress] No doc found for ${userId}, creating new.`);
             progressDoc = await BeltProgress.create({ userId, belts: {} });
        } else {
             // Debug log specific to White belt to check if data exists in DB
             if (progressDoc.belts && progressDoc.belts.W) {
                 const wData = progressDoc.belts.W.toObject ? progressDoc.belts.W.toObject() : progressDoc.belts.W;
                 console.log(`[GetBeltProgress] White Belt Data in DB:`, JSON.stringify(wData));
             }
        }

        const dbUpdates = {};
        
        BELT_ORDER.forEach(code => {
            dbUpdates[`belts.${code}.planSessionCount`] = distSessions[code];
        });

        await BeltProgress.updateOne(
            { userId }, 
            { $set: dbUpdates }
        );
        
        const responseBelts = {};
        
       BELT_ORDER.forEach(code => {
            let savedBeltData = progressDoc.belts ? progressDoc.belts[code] : {};
            
            if (savedBeltData && typeof savedBeltData.toObject === 'function') {
                savedBeltData = savedBeltData.toObject();
            }
            const docData = savedBeltData || {};
            
            // Base fields common to all belts
            const beltResponse = {
                planSessionCount: distSessions[code],
                activeDayCount: docData.activeDayCount || 0,
                reqSessionCount: BELT_SESSION_REQ[code],
                reqActiveDayCount: BELT_ACTIVE_DAY_REQ[code],
                isCompleted: docData.isCompleted || false,
                progressPercentage: docData.progressPercentage || 0,
            };

            if (code === 'W') {
    // Force accessing the property safely
    const count = (docData && docData.openResourceCount !== undefined) 
        ? docData.openResourceCount 
        : 0;
    
    beltResponse.openResourceCount = count;
    
    // Add this log to verify what the backend is actually sending
    console.log(`[GetBeltProgress] Sending White Belt openResourceCount: ${count}`); 
}
            // -----------------------------------------------------

            const exclude = ['planSessionCount', 'activeDayCount', 'isCompleted', '_id', 'id']; 
            Object.keys(docData).forEach(key => {
                if (!exclude.includes(key) && docData[key] !== undefined) {
                    beltResponse[key] = docData[key];
                }
            });

            responseBelts[code] = beltResponse;
        });

        if (responseBelts.W) {
             console.log(`[GetBeltProgress] 4. FINAL SENDING W:`, JSON.stringify(responseBelts.W));
        }

        res.json({
            success: true,
            userId: userId,
            totals: {
                sessions: totalSessions,
                activeDays: 0 
            },
            belts: responseBelts 
        });
    }));

    router.post('/update', asyncHandler(async (req, res) => {
        const { userId, beltColor, actionType } = req.body;

        if (!userId || !beltColor || !actionType) {
            return res.status(400).json({ success: false, msg: 'Missing fields' });
        }

        const code = getBeltCode(beltColor);

        // Handle Global Active Day update
        if (actionType === 'active_day') {
            await User.findByIdAndUpdate(userId, { $inc: { activeDaysCount: 1 } });
            return res.json({ success: true, msg: 'Global active day count updated' });
        }

        const validFields = {
            'recommendation': 'recommendationCount',
            'photo': 'sessionPhotoCount',
            'post': 'postCount',
            'description': 'writeShortDescriptionCount',
            'share_tip': 'shareTipCount',
            'open_resource': 'openResourceCount'
        };

        const fieldToUpdate = validFields[actionType];
        if (!fieldToUpdate) {
            return res.status(400).json({ success: false, msg: 'Invalid action type' });
        }

        const exists = await BeltProgress.exists({ userId });
        if (!exists) await BeltProgress.create({ userId, belts: {} });

        const updatePath = `belts.${code}.${fieldToUpdate}`;
        
        await BeltProgress.updateOne(
            { userId },
            { $inc: { [updatePath]: 1 } }
        );

        res.json({ success: true, msg: `Updated ${fieldToUpdate} for ${code}` });
    }));

    return router;
};