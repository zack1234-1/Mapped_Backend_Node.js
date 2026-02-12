const express = require('express');
const mongoose = require('mongoose');
const BeltProgress = require('../models/beltProgress');
const User = require('../models/User');
const BELT_ORDER = ['W', 'Y', 'G', 'B', 'R', 'L'];

const REQUIREMENTS = {
    'W': { session: 3, activeDay: 3, post: 0, shareTip: 0, resource: 3, reflection: 0, recommendation: 0 },
    'Y': { session: 5, activeDay: 5, post: 0, shareTip: 0, resource: 0, reflection: 0, recommendation: 3 },
    'G': { session: 8, activeDay: 14, post: 1, shareTip: 0, resource: 0, reflection: 1, recommendation: 5 },
    'B': { session: 20, activeDay: 30, post: 1, shareTip: 1, resource: 0, reflection: 0, recommendation: 0 },
    'R': { session: 20, activeDay: 60, post: 0, shareTip: 3, resource: 0, reflection: 0, recommendation: 10 },
    'L': { session: 0, activeDay: 0, post: 0, shareTip: 0, resource: 0, reflection: 0, recommendation: 0 }
};

const BELT_NAMES = {
    'W': 'White',
    'Y': 'Yellow',
    'G': 'Green', 
    'B': 'Blue',
    'R': 'Brown',
    'L': 'Black'
};

const FIELD_MAP = {
    'active_day': 'activeDayCount',
    'session': 'planSessionCount',
    'post': 'postCount',
    'share_tip': 'shareTipCount',
    'resource': 'openResourceCount',
    'reflection': 'reflectionCount',
    'recommendation': 'recommendationCount'
};

const REQ_MAP = {
    'active_day': 'activeDay',
    'session': 'session',
    'post': 'post',
    'share_tip': 'shareTip',
    'resource': 'resource',
    'reflection': 'reflection',
    'recommendation': 'recommendation'
};


// Percentage Calculator
const calculatePercentage = (beltData, req) => {
    let totalReq = req.session + req.activeDay + req.post + req.shareTip + req.resource + req.reflection + req.recommendation;
    if (totalReq === 0) return 100; // Avoid division by zero for empty requirements

    let totalDone = 
        Math.min(beltData.planSessionCount||0, req.session) + 
        Math.min(beltData.activeDayCount||0, req.activeDay) + 
        Math.min(beltData.postCount||0, req.post) + 
        Math.min(beltData.shareTipCount||0, req.shareTip) + 
        Math.min(beltData.openResourceCount||0, req.resource) + 
        Math.min(beltData.reflectionCount || 0, req.reflection) + 
        Math.min(beltData.recommendationCount||0, req.recommendation);
    
    return Math.min(Math.round((totalDone / totalReq) * 100), 100);
};

// Strict Requirement Check
const areRequirementsMet = (beltData, req) => {
    return (
        (beltData.planSessionCount || 0) >= req.session &&
        (beltData.activeDayCount || 0) >= req.activeDay &&
        (beltData.postCount || 0) >= req.post &&
        (beltData.shareTipCount || 0) >= req.shareTip &&
        (beltData.openResourceCount || 0) >= req.resource &&
        (beltData.reflectionCount || 0) >= req.reflection &&
        (beltData.recommendationCount || 0) >= req.recommendation
    );
};

// Find Active Belt Code 
const findActiveBeltCode = (progressDoc) => {
    if (!progressDoc || !progressDoc.belts) return 'W';
    
    for (const code of BELT_ORDER) {
        const beltData = progressDoc.belts[code];
        if (!beltData || !beltData.isCompleted) {
            return code;
        }
    }
    return 'L'; 
};

// Sync User DB Level based on Progress
const syncUserBeltLevel = async (userId, progressDoc) => {
    try {
        let expectedActiveBeltCode = 'W';

        for (const code of BELT_ORDER) {
            const beltData = progressDoc.belts[code];
            if (beltData && (beltData.isCompleted || beltData.progressPercentage >= 100)) {
                const currentIndex = BELT_ORDER.indexOf(code);
                if (currentIndex < BELT_ORDER.length - 1) {
                    expectedActiveBeltCode = BELT_ORDER[currentIndex + 1];
                } else {
                    expectedActiveBeltCode = 'L'; 
                }
            } else {
                break;
            }
        }

        const correctBeltName = BELT_NAMES[expectedActiveBeltCode];
        const user = await User.findById(userId);

        if (user && user.currentBelt !== correctBeltName) {
            console.log(`🔄 SYNC: Upgrading User ${userId} from ${user.currentBelt} to ${correctBeltName}`);
            user.currentBelt = correctBeltName;
            user.updatedAt = new Date();
            await user.save();
            return correctBeltName;
        }
    } catch (error) {
        console.error("Error syncing user belt level:", error);
    }
};

// Increment Logic
const incrementBeltProgress = async (userId, fieldType) => {
    let progressDoc = await BeltProgress.findOne({ userId });
    
    if (!progressDoc) {
        progressDoc = await BeltProgress.create({ 
            userId, 
            belts: { W: { activeDayCount: 0, planSessionCount: 0, postCount: 0, shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, recommendationCount: 0, isCompleted: false, progressPercentage: 0 } } 
        });
    }

    const activeCode = findActiveBeltCode(progressDoc);
    if (activeCode === 'L' && progressDoc.belts['L']?.isCompleted) return; 

    if (fieldType === 'reflection' && activeCode !== 'G') {
        return; 
    }

    if (!progressDoc.belts[activeCode]) {
        progressDoc.belts[activeCode] = { activeDayCount: 0, planSessionCount: 0, postCount: 0, shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, recommendationCount: 0, isCompleted: false, progressPercentage: 0 };
    }

    const dbField = FIELD_MAP[fieldType];
    const reqKey = REQ_MAP[fieldType];

    if (!dbField || !reqKey) return;

    const target = REQUIREMENTS[activeCode][reqKey] || 0;
    if (target === 0) return;

    const currentVal = progressDoc.belts[activeCode][dbField] || 0;
    if (currentVal < target) {
        progressDoc.belts[activeCode][dbField] = currentVal + 1;
    }

    const req = REQUIREMENTS[activeCode];
    const beltData = progressDoc.belts[activeCode];
    const isMet = areRequirementsMet(beltData, req);
    const percentage = calculatePercentage(beltData, req);
    
    progressDoc.belts[activeCode].progressPercentage = percentage;

    if (isMet || percentage >= 100) {
        if (!progressDoc.belts[activeCode].isCompleted) {
            progressDoc.belts[activeCode].isCompleted = true;
            progressDoc.belts[activeCode].progressPercentage = 100;
            progressDoc.belts[activeCode].completedAt = new Date();
        }

        if (activeCode === 'R') {
            if (!progressDoc.belts['L']) {
                 progressDoc.belts['L'] = { activeDayCount: 0, planSessionCount: 0, postCount: 0, shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, recommendationCount: 0, isCompleted: false, progressPercentage: 0 };
            }
            progressDoc.belts['L'].isCompleted = true;
            progressDoc.belts['L'].progressPercentage = 100;
            progressDoc.belts['L'].completedAt = new Date();
            progressDoc.markModified('belts.L');
        }
    }

    progressDoc.markModified('belts'); 
    progressDoc.markModified(`belts.${activeCode}`);
    
    await progressDoc.save();
    await syncUserBeltLevel(userId, progressDoc);

    return { 
        activeCode, 
        val: progressDoc.belts[activeCode][dbField], 
        percentage: progressDoc.belts[activeCode].progressPercentage,
        isCompleted: progressDoc.belts[activeCode].isCompleted
    };
};

const updateBeltWithValues = async (userId, updates) => {
    let progressDoc = await BeltProgress.findOne({ userId });
    if (!progressDoc) {
        progressDoc = await BeltProgress.create({ 
            userId, belts: { W: { activeDayCount: 0, planSessionCount: 0, postCount: 0, shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, recommendationCount: 0, isCompleted: false, progressPercentage: 0 } } 
        });
    }

    const activeCode = findActiveBeltCode(progressDoc);
    if (!progressDoc.belts[activeCode]) {
        progressDoc.belts[activeCode] = { activeDayCount: 0, planSessionCount: 0, postCount: 0, shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, recommendationCount: 0, isCompleted: false, progressPercentage: 0 };
    }

    let needsSave = false;

    for (const [key, value] of Object.entries(updates)) {
        const dbField = FIELD_MAP[key];
        const reqKey = REQ_MAP[key];

        if (dbField && reqKey) {
            const target = REQUIREMENTS[activeCode][reqKey] || 0;
            if (target === 0) continue;

            const currentVal = progressDoc.belts[activeCode][dbField] || 0;
            if (value > currentVal) {
                progressDoc.belts[activeCode][dbField] = value;
                needsSave = true;
            }
        }
    }

    if (needsSave) {
        const req = REQUIREMENTS[activeCode];
        const beltData = progressDoc.belts[activeCode];
        const isMet = areRequirementsMet(beltData, req);
        const percentage = calculatePercentage(beltData, req);

        progressDoc.belts[activeCode].progressPercentage = percentage;

        if (isMet || percentage >= 100) {
            if (!progressDoc.belts[activeCode].isCompleted) {
                progressDoc.belts[activeCode].isCompleted = true;
                progressDoc.belts[activeCode].progressPercentage = 100;
                progressDoc.belts[activeCode].completedAt = new Date();
            }
        }

        progressDoc.markModified('belts'); 
        progressDoc.markModified(`belts.${activeCode}`);
        await progressDoc.save();
    }
    
    await syncUserBeltLevel(userId, progressDoc);
};

// Get And Heal 
const getAndHealBeltData = async (userId) => {
    let progressDoc = await BeltProgress.findOne({ userId });
    
    if (!progressDoc) {
            progressDoc = await BeltProgress.create({ 
            userId, 
            belts: { 
                W: { 
                    activeDayCount: 0, planSessionCount: 0, postCount: 0, 
                    shareTipCount: 0, openResourceCount: 0, reflectionCount: 0, 
                    recommendationCount: 0, isCompleted: false, progressPercentage: 0 
                } 
            } 
        });
    }

    let hasChanges = false;
    const responseBelts = {};

    BELT_ORDER.forEach(code => {
        if (!progressDoc.belts[code]) {
            if (progressDoc.belts) progressDoc.belts[code] = {};
        }
        
        const saved = progressDoc.belts[code] || {};
        const req = REQUIREMENTS[code];

        let physicalRequirementsMet = areRequirementsMet(saved, req);
        let correctPct = calculatePercentage(saved, req);

        if (code === 'L') {
            const brownBelt = progressDoc.belts['R'];
            const isBrownDone = brownBelt && brownBelt.isCompleted;

            if (!isBrownDone) {
                correctPct = 0;
                saved.isCompleted = false;
                saved.progressPercentage = 0;
                if (progressDoc.belts[code].isCompleted) {
                    progressDoc.belts[code].isCompleted = false;
                    progressDoc.belts[code].progressPercentage = 0;
                    hasChanges = true; 
                }
                physicalRequirementsMet = false;
            }
        }

        if (progressDoc instanceof mongoose.Model) {
            if ((physicalRequirementsMet || correctPct >= 100) && !saved.isCompleted) {
                saved.isCompleted = true;
                saved.progressPercentage = 100;
                saved.completedAt = saved.completedAt || new Date();
                hasChanges = true;
            }
            else if (!saved.isCompleted && saved.progressPercentage !== correctPct) {
                saved.progressPercentage = correctPct;
                hasChanges = true;
            }
        }

        responseBelts[code] = {
            planSessionCount: saved.planSessionCount || 0,
            activeDayCount: saved.activeDayCount || 0,
            postCount: saved.postCount || 0,
            shareTipCount: saved.shareTipCount || 0,
            openResourceCount: saved.openResourceCount || 0,
            reflectionCount: saved.reflectionCount || 0,
            recommendationCount: saved.recommendationCount || 0,
            isCompleted: saved.isCompleted || false,
            progressPercentage: saved.progressPercentage || 0, 
            reqSessionCount: req.session,
            reqActiveDayCount: req.activeDay,
            reqPostCount: req.post,
            reqShareTipCount: req.shareTip,
            reqResourceCount: req.resource,
            reqReflectionCount: req.reflection,
            reqRecommendationCount: req.recommendation,
        };
    });

    if (hasChanges && progressDoc instanceof mongoose.Model) {
        progressDoc.markModified('belts');
        await progressDoc.save();
    }

    await syncUserBeltLevel(userId, progressDoc);

    return { success: true, userId, belts: responseBelts };
};


module.exports = (asyncHandler) => {
    const router = express.Router();

    router.get('/', asyncHandler(async (req, res) => {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, msg: 'User ID is required' });

        const data = await getAndHealBeltData(userId);
        res.json(data);
    }));

    router.post('/update', asyncHandler(async (req, res) => {
        const { userId, actionType } = req.body; 
        if (!userId || !actionType) return res.status(400).json({ success: false, msg: 'Missing fields' });

        let internalAction = actionType;
        if (actionType === 'shareTip') internalAction = 'share_tip';
        if (actionType === 'open_resource') internalAction = 'resource';
        if (actionType === 'reflection') internalAction = 'reflection';

        const result = await incrementBeltProgress(userId, internalAction);

        res.json({ success: true, msg: 'Progress Updated', data: result });
    }));

    router.post('/daily-check', asyncHandler(async (req, res) => {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false });

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const lastLoginStr = user.lastLogin ? new Date(user.lastLogin).toISOString().split('T')[0] : null;

        if (lastLoginStr !== todayStr) {
            user.lastLogin = now;
            await user.save();
            await incrementBeltProgress(userId, 'active_day');
            return res.json({ success: true, msg: 'Active day counted' });
        }
        res.json({ success: true, msg: 'Already checked in today' });
    }));

    router.post('/sync-belt', asyncHandler(async (req, res) => {
        const { userId } = req.body;
        await incrementBeltProgress(userId, 'session');
        res.json({ success: true, msg: 'Session counted' });
    }));

    router.post('/sync-data', asyncHandler(async (req, res) => {
        const { userId, metrics } = req.body; 
        if (!userId) return res.status(400).json({ success: false, msg: 'User ID is required' });
        if (metrics) {
            await updateBeltWithValues(userId, metrics);
        }
        const data = await getAndHealBeltData(userId);
        res.json(data);
    }));

    return router;
};