const express = require('express');
const router = express.Router();
const Forum = require('../models/Post');
const User = require('../models/User');
const mongoose = require('mongoose');

module.exports = (asyncHandler) => {
    
    // @route   GET /api/admin/reports
   router.get('/reports', asyncHandler(async (req, res, next) => {
        const reportedPosts = await Forum.find({
            reports: { $exists: true, $not: { $size: 0 } }
        })
        .sort({ date: -1 })
        // ADD THIS LINE: This pulls name, avatar, AND isBlocked from the User collection
        .populate('user', 'name avatar isBlocked'); 

        res.json({
            success: true,
            count: reportedPosts.length,
            data: reportedPosts
        });
    }));

    // @route   DELETE /api/admin/post/:id
    router.delete('/post/:id', asyncHandler(async (req, res, next) => {
        const post = await Forum.findByIdAndDelete(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        res.json({ success: true, message: "Post successfully removed by admin" });
    }));

    // @route   PATCH /api/admin/dismiss/:id
    router.patch('/dismiss/:id', asyncHandler(async (req, res, next) => {
        const post = await Forum.findByIdAndUpdate(
            req.params.id, 
            { $set: { reports: [] } }, 
            { new: true }
        );

        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        res.json({ success: true, message: "Reports cleared", data: post });
    }));

    // @route   PATCH /api/admin/user/block/:id
    router.patch('/user/block/:id', asyncHandler(async (req, res, next) => {
        const userId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { isBlocked: true } },
            { new: true } // Returns the updated document
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // REMOVED: next(err); -> This was causing your crash.
        
        res.json({ 
            success: true, 
            message: `User ${user.name} is now blocked`, 
            data: user 
        });
    }));

    // @route   PATCH /api/admin/user/unblock/:id
    router.patch('/user/unblock/:id', asyncHandler(async (req, res, next) => {
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