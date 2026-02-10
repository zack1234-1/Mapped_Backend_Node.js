const express = require('express');
const mongoose = require('mongoose');
const BeltProgress = require('../models/beltProgress');
const Session = require('../models/session');
const User = require('../models/User');
const Post = require('../models/Post');

const BELT_POST_REQ = { 'W': 0, 'Y': 0, 'G': 1, 'B': 1, 'R': 0, 'L': 0 };
const BELT_SHARE_TIP_REQ = { 'W': 0, 'Y': 0, 'G': 0, 'B': 1, 'R': 3, 'L': 0 };
const BELT_SESSION_REQ = { 'W': 3, 'Y': 5, 'G': 8, 'B': 20, 'R': 20, 'L': 0 };
const BELT_ACTIVE_DAY_REQ = { 'W': 3, 'Y': 5, 'G': 14, 'B': 30, 'R': 60, 'L': 0 };
const BELT_RESOURCE_REQ = { 'W': 3, 'Y': 0, 'G': 0, 'B': 0, 'R': 0, 'L': 0 };
const BELT_REFLECTION_REQ = { 'W': 0, 'Y': 0, 'G': 1, 'B': 0, 'R': 0, 'L': 0 };
const BELT_RECOMMENDATION_REQ = { 'W': 0, 'Y': 3, 'G': 5, 'B': 0, 'R': 10, 'L': 0 };

const BELT_ORDER = ['W', 'Y', 'G', 'B', 'R', 'L'];

const calculateTotalRecommendations = (doc) => {
    if (!doc || !doc.belts) return 0;
    const y = doc.belts.Y?.recommendationCount || 0;
    const g = doc.belts.G?.recommendationCount || 0;
    const r = doc.belts.R?.recommendationCount || 0;
    return y + g + r;
};

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

const getBeltCode = (input) => {
    if (!input) return null;
    const normalized = input.trim();
    const map = { 'White': 'W', 'Yellow': 'Y', 'Green': 'G', 'Blue': 'B', 'Brown': 'R', 'Black': 'L' };
    if (Object.values(map).includes(normalized)) return normalized;
    return map[normalized] || normalized; 
};

const calculateTotalActiveDays = (progressDoc) => {
    if (!progressDoc || !progressDoc.belts) return 0;
    let total = 0;
    const codes = ['W', 'Y', 'G', 'B', 'R', 'L'];
    codes.forEach(code => {
        if (progressDoc.belts[code] && progressDoc.belts[code].activeDayCount) {
            total += progressDoc.belts[code].activeDayCount;
        }
    });
    return total;
};

module.exports = (asyncHandler) => {
    const router = express.Router();

   // Daily Check Endpoint
    router.post('/daily-check', asyncHandler(async (req, res) => {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, msg: 'User ID is required' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

        let progressDoc = await BeltProgress.findOne({ userId });
        if (!progressDoc) {
            progressDoc = await BeltProgress.create({ userId, belts: {} });
        }

        let currentTotal = calculateTotalActiveDays(progressDoc);

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; 
        const lastLoginStr = user.lastLogin ? new Date(user.lastLogin).toISOString().split('T')[0] : null;
        
        let shouldUpdate = false;

        if (currentTotal === 0) {
            currentTotal = 1;
            shouldUpdate = true;
        } 
        else if (lastLoginStr !== todayStr) {
            currentTotal += 1;
            shouldUpdate = true;
        }

        // 5. Execution Phase
        if (shouldUpdate) {
            const distDays = distributeCountToBelts(currentTotal, BELT_ACTIVE_DAY_REQ);
            
            const beltUpdates = {};
            BELT_ORDER.forEach(code => {
                beltUpdates[`belts.${code}.activeDayCount`] = distDays[code];
            });

            await BeltProgress.updateOne({ userId }, { $set: beltUpdates });
            
            user.lastLogin = now;
            await user.save();
            
            console.log(`✅ Active days updated to ${currentTotal} for user ${userId}`);
        } else {
             user.lastLogin = now;
             await user.save();
        }

        res.json({ success: true, activeDaysCount: currentTotal });
    }));

    router.get('/', asyncHandler(async (req, res) => {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, msg: 'User ID is required' });

        let progressDoc = await BeltProgress.findOne({ userId }).lean();
        if (!progressDoc) progressDoc = await BeltProgress.create({ userId, belts: {} });

        const totalSessions = await Session.countDocuments({ trainerId: userId });
        const distSessions = distributeCountToBelts(totalSessions, BELT_SESSION_REQ);
        const totalRecommendations = calculateTotalRecommendations(progressDoc);
        const distRecommendations = distributeCountToBelts(totalRecommendations, BELT_RECOMMENDATION_REQ);
        let totalComments = 0;
        let totalCreatedPosts = 0;

        if (mongoose.Types.ObjectId.isValid(userId)) {
            const commentAggregation = await Post.aggregate([
                { $unwind: "$comments" },
                { $match: { "comments.user": new mongoose.Types.ObjectId(userId) } },
                { $count: "count" }
            ]);
            totalComments = commentAggregation.length > 0 ? commentAggregation[0].count : 0;
            totalCreatedPosts = await Post.countDocuments({ user: userId });
        }
        const distPosts = distributeCountToBelts(totalComments, BELT_POST_REQ);
        const distShareTips = distributeCountToBelts(totalCreatedPosts, BELT_SHARE_TIP_REQ);
        const dbUpdates = {};

        BELT_ORDER.forEach(code => {
            dbUpdates[`belts.${code}.planSessionCount`] = distSessions[code];
            if (['G', 'B'].includes(code)) dbUpdates[`belts.${code}.postCount`] = distPosts[code];
            if (['B', 'R'].includes(code)) dbUpdates[`belts.${code}.shareTipCount`] = distShareTips[code];
        });

        await BeltProgress.updateOne({ userId }, { $set: dbUpdates });

        let updatedDoc = await BeltProgress.findOne({ userId }).lean();
        if (!updatedDoc) updatedDoc = { belts: {} };

        const responseBelts = {};
        BELT_ORDER.forEach(code => {
            let savedBeltData = updatedDoc.belts ? updatedDoc.belts[code] : {};
            const docData = savedBeltData || {};

            const beltResponse = {
                planSessionCount: distSessions[code],
                postCount: distPosts[code],
                shareTipCount: distShareTips[code],
                recommendationCount: distRecommendations[code],
                activeDayCount: docData.activeDayCount || 0,
                reqSessionCount: BELT_SESSION_REQ[code],
                reqActiveDayCount: BELT_ACTIVE_DAY_REQ[code],
                reqPostCount: BELT_POST_REQ[code],
                reqShareTipCount: BELT_SHARE_TIP_REQ[code],
                reqResourceCount: BELT_RESOURCE_REQ[code],
                reqReflectionCount: BELT_REFLECTION_REQ[code],
                reqRecommendationCount: BELT_RECOMMENDATION_REQ[code],
                isCompleted: docData.isCompleted || false,
                progressPercentage: docData.progressPercentage || 0,
            };
            if (code === 'W') beltResponse.openResourceCount = docData.openResourceCount || 0;

            responseBelts[code] = beltResponse;
        });

        res.json({ success: true, userId, belts: responseBelts });
    }));

    router.post('/sync-belt', asyncHandler(async (req, res) => {
        const { userId, beltColor, planSessionCount, activeDayCount, progressPercentage, openResourceCount } = req.body;

        if (!userId || !beltColor) {
            return res.status(400).json({ success: false, msg: 'Missing required fields' });
        }

        const code = getBeltCode(beltColor);
        if (!code) {
             return res.status(400).json({ success: false, msg: 'Invalid belt color' });
        }

        const updateData = {};
        const updatePath = `belts.${code}`;

        if (planSessionCount !== undefined) updateData[`${updatePath}.planSessionCount`] = planSessionCount;
        if (activeDayCount !== undefined) updateData[`${updatePath}.activeDayCount`] = activeDayCount;
        if (progressPercentage !== undefined) {
            const roundedProgress = Math.round(Number(progressPercentage));
            updateData[`${updatePath}.progressPercentage`] = roundedProgress;
            if (roundedProgress >= 100) {
                updateData[`${updatePath}.isCompleted`] = true;
            }
        }

        if (openResourceCount !== undefined) {
            const incomingVal = Number(openResourceCount);
            const currentDoc = await BeltProgress.findOne({ userId });
            const currentVal = currentDoc?.belts?.[code]?.openResourceCount || 0;
            
            if (incomingVal > currentVal) {
                updateData[`${updatePath}.openResourceCount`] = incomingVal;
            }
        }

        await BeltProgress.updateOne(
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
            data: { beltColor: code, activeDayCount, progressPercentage }
        });
    }));


    router.post('/update', asyncHandler(async (req, res) => {
        const { userId, beltColor, actionType } = req.body;
        if (!userId || !actionType) return res.status(400).json({ success: false, msg: 'Missing fields' });
        if (actionType === 'recommendation') {
            const currentDoc = await BeltProgress.findOne({ userId }).lean();
            if (!currentDoc) {
                await BeltProgress.create({ userId, belts: { Y: { recommendationCount: 1 } } });
                return res.json({ success: true, msg: 'Recommendation count started' });
            }

            const currentTotal = calculateTotalRecommendations(currentDoc);
            const newTotal = currentTotal + 1;
            const dist = distributeCountToBelts(newTotal, BELT_RECOMMENDATION_REQ);

            await BeltProgress.updateOne(
                { userId },
                {
                    $set: {
                        'belts.Y.recommendationCount': dist.Y,
                        'belts.G.recommendationCount': dist.G,
                        'belts.R.recommendationCount': dist.R,
                    }
                }
            );
            return res.json({ success: true, msg: 'Recommendation count updated' });
        }

        if (actionType === 'active_day') {
            await User.updateOne({ _id: userId }, { $inc: { activeDaysCount: 1 } });
            return res.json({ success: true, msg: 'Global active day count updated' });
        }

        const code = getBeltCode(beltColor);
        const validFields = { 'post': 'postCount', 'description': 'writeShortDescriptionCount', 'share_tip': 'shareTipCount', 'open_resource': 'openResourceCount' };
        const fieldToUpdate = validFields[actionType];
        
        if (fieldToUpdate) {
             const updatePath = `belts.${code}.${fieldToUpdate}`;
             await BeltProgress.updateOne({ userId }, { $inc: { [updatePath]: 1 } });
             return res.json({ success: true, msg: `Updated ${fieldToUpdate}` });
        }
        
        return res.status(400).json({ success: false, msg: 'Invalid action type' });
    }));

    return router;
};