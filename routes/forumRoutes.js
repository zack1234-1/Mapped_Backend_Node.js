const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');

// --- MULTER SETUP (Memory storage for Cloudinary) ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    limits: { 
        fileSize: 1 * 1024 * 1024, // 1MB per file
        files: 4 // Maximum 4 files
    },
    fileFilter: (req, file, cb) => {
        // Check file size
        if (file.size > 1 * 1024 * 1024) {
            return cb(new Error('File size exceeds 1MB limit'));
        }
        cb(null, true);
    }
});

// 1. CREATE POST
router.post('/', upload.array('postImages', 4), async (req, res) => {
    try {
        const userId = req.body.userId; 
        if (!userId) {
            return res.status(400).json({ msg: 'Missing userId' });
        }
        
        // Validate ID format to prevent crashes
        if (!mongoose.Types.ObjectId.isValid(userId)) {
             return res.status(400).json({ msg: 'Invalid userId format' });
        }

        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Check if too many files
        if (req.files && req.files.length > 4) {
            return res.status(400).json({ msg: 'Maximum 4 images allowed per post' });
        }

        // Upload images to Cloudinary
        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const uploadResult = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            { folder: 'posts' },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        uploadStream.end(file.buffer);
                    });
                    imageUrls.push(uploadResult.secure_url);
                    console.log('✅ Image uploaded to Cloudinary:', uploadResult.secure_url);
                } catch (cloudinaryError) {
                    console.error('❌ Cloudinary upload error:', cloudinaryError);
                    return res.status(500).json({ msg: 'Image upload failed', error: cloudinaryError.message });
                }
            }
        }

        let tags = [];
        if (req.body.tags) {
            tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        const newPost = new Post({
            text: req.body.text,
            name: user.name || user.username,
            avatar: user.avatar,
            user: userId,
            images: imageUrls,
            videoUrl: req.body.videoUrl || '',
            videoThumbnail: req.body.videoThumbnail || '',
            tags: tags
        });

        const post = await newPost.save();
        res.json(post);
    } catch (err) {
        console.error('❌ Create Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 2. GET ALL POSTS
router.get('/', async (req, res) => {
    try {
        const posts = await Post.find().sort({ isPinned: -1, date: -1 });
        res.json(posts);
    } catch (err) {
        console.error('Get Posts Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 3. GET POPULAR TAGS (MOVED UP - Must be before /:id)
router.get('/tags', async (req, res) => {
    try {
        const tags = await Post.aggregate([
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
            { $project: { _id: 0, name: "$_id", count: 1 } }
        ]);
        res.json(tags);
    } catch (err) {
        console.error('Get Tags Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 4. SEARCH POSTS (MOVED UP - Must be before /:id)
router.get('/search', async (req, res) => {
    try {
        const { q, tag } = req.query; 

        if (!q && !tag) {
            return res.status(400).json({ msg: 'No query or tag provided' });
        }

        let query = {};

        // Tag search
        if (tag) {
            query.tags = { $regex: tag, $options: 'i' };
        }

        // Text search (combined with tag if both exist)
        if (q) {
            query.$or = [
                { text: { $regex: q, $options: 'i' } },
                { tags: { $regex: q, $options: 'i' } }, 
                { name: { $regex: q, $options: 'i' } }
            ];
        }

        const posts = await Post.find(query).sort({ isPinned: -1, date: -1 });
        res.json(posts);
    } catch (err) {
        console.error('Search Posts Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 5. GET SINGLE POST (MOVED DOWN - This catches everything else)
router.get('/:id', async (req, res) => {
    try {
        // Double check ID validity before querying
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ msg: 'Post not found (Invalid ID)' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });
        
        res.json(post);
    } catch (err) {
        console.error('Get Single Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 6. TOGGLE PIN
router.put('/pin/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        post.isPinned = !post.isPinned;
        await post.save();

        res.json(post);
    } catch (err) {
        console.error('Toggle Pin Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 7. REPORT A POST
router.post('/report/:id', async (req, res) => {
    try {
        const { userId, reason } = req.body;
        
        if (!userId || !reason) return res.status(400).json({ msg: 'Missing userId or reason' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const alreadyReported = post.reports.some(r => r.user.toString() === userId);
        if (alreadyReported) return res.status(400).json({ msg: 'You have already reported this post' });

        post.reports.push({ user: userId, reason: reason });
        await post.save();

        res.json({ msg: 'Report submitted successfully', reports: post.reports });
    } catch (err) {
        console.error('Report Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 8. LIKE POST
router.put('/like/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ msg: 'Missing userId' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const likeIndex = post.likes.findIndex(like => like.user.toString() === userId);

        if (likeIndex > -1) {
            post.likes.splice(likeIndex, 1);
        } else {
            post.likes.unshift({ user: userId });
        }

        await post.save();
        res.json(post.likes);
    } catch (err) {
        console.error('Like Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 9. COMMENT ON POST
router.post('/comment/:id', async (req, res) => {
    try {
        const { userId, text } = req.body;
        if (!userId || !text) return res.status(400).json({ msg: 'Missing userId or text' });

        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const newComment = {
            text: text.trim(),
            name: user.name || user.username,
            avatar: user.avatar,
            user: userId,
            date: new Date()
        };

        post.comments.unshift(newComment);
        await post.save();
        
        res.json(post.comments);
    } catch (err) {
        console.error('Comment Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 10. DELETE POST
router.delete('/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ msg: 'Missing userId' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        if (post.user.toString() !== userId) {
            return res.status(401).json({ msg: 'User not authorized to delete this post' });
        }

        // Delete associated images from Cloudinary
        if (post.images && post.images.length > 0) {
            for (const imageUrl of post.images) {
                try {
                    // Extract public_id from Cloudinary URL
                    const urlParts = imageUrl.split('/');
                    const fileName = urlParts[urlParts.length - 1];
                    const publicId = `posts/${fileName.split('.')[0]}`;
                    
                    await cloudinary.uploader.destroy(publicId);
                    console.log('✅ Image deleted from Cloudinary:', publicId);
                } catch (cloudinaryError) {
                    console.error('⚠️  Error deleting image from Cloudinary:', cloudinaryError);
                    // Continue with deletion even if Cloudinary delete fails
                }
            }
        }

        await Post.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Post deleted successfully' });
    } catch (err) {
        console.error('❌ Delete Post Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;