const express = require('express');
const router = express.Router();
const Forum = require('../models/Post'); // Adjust path to your Forum model

module.exports = (asyncHandler) => {
    
    // @route   GET /api/admin/reports
    // @desc    Get only posts that have reports
    router.get('/reports', asyncHandler(async (req, res) => {
        // Query logic: reports array exists and is not empty
        const reportedPosts = await Forum.find({
            reports: { $exists: true, $not: { $size: 0 } }
        }).sort({ date: -1 });

        res.json({
            success: true,
            count: reportedPosts.length,
            data: reportedPosts
        });
    }));

    // @route   DELETE /api/admin/post/:id
    // @desc    Admin deletes a post permanently
    router.delete('/post/:id', asyncHandler(async (req, res) => {
        const post = await Forum.findByIdAndDelete(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        res.json({ success: true, message: "Post successfully removed by admin" });
    }));

    // @route   PATCH /api/admin/dismiss/:id
    // @desc    Clear reports from a post (Dismissing the report)
    router.patch('/dismiss/:id', asyncHandler(async (req, res) => {
        const post = await Forum.findByIdAndUpdate(
            req.params.id, 
            { $set: { reports: [] } }, // Empty the reports array
            { new: true }
        );

        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        res.json({ success: true, message: "Reports cleared", data: post });
    }));

    router.patch('/user/block/:id', asyncHandler(async (req, res) => {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { isBlocked: true } }, // Ensure 'isBlocked' exists in your User Schema
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ 
            success: true, 
            message: `User ${user.name} has been blocked`, 
            data: user 
        });
    }));

    router.patch('/user/unblock/:id', asyncHandler(async (req, res) => {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { isBlocked: false } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ 
            success: true, 
            message: `User ${user.name} has been unblocked`, 
            data: user 
        });
    }));

    return router;
};