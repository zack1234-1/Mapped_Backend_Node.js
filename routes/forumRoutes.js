const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- MULTER SETUP FOR IMAGE UPLOADS ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/posts';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, 'uploads/posts/'); 
    },
    filename: (req, file, cb) => {
        cb(null, `post-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images Only!');
        }
    }
});

// --- ROUTES ---

// 1. CREATE A POST
// POST /api/forum
// Body: { userId, text, tags (comma separated) }
// File: postImage (optional)
router.post('/', upload.single('postImages', 10), async (req, res) => {
    try {
        const user = await User.findById(req.body.userId).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            imagePaths = req.files.map(file => file.path.replace(/\\/g, "/"));
        }

        let tags = [];
        if (req.body.tags) {
            tags = req.body.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
        }

        const newPost = new Post({
            text: req.body.text,
            name: user.name,
            avatar: user.avatar,
            user: req.body.userId,
            image: imagePaths.length > 0 ? imagePaths[0] : "",
            images: imagePaths,
            tags: tags,
            videoUrl: req.body.videoUrl || "", 
            videoThumbnail: req.body.videoThumbnail || ""
        });

        const post = await newPost.save();
        res.json(post);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 2. GET ALL POSTS (Feed)
// GET /api/forum
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await Post.find()
            .sort({ date: -1 })
            .populate('user', ['name', 'avatar']);
        res.json(posts);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 3. GET ALL UNIQUE TAGS
// GET /api/forum/tags
router.get('/tags', async (req, res) => {
    try {
        // Aggregate all unique tags from all posts
        const tags = await Post.distinct('tags');
        
        // Filter out empty strings and sort alphabetically
        const filteredTags = tags
            .filter(tag => tag && tag.trim() !== '')
            .sort();
        
        res.json(filteredTags);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 4. SEARCH POSTS
// GET /api/forum/search?q=kick&tag=taekwondo
router.get('/search', async (req, res) => {
    try {
        const { q, tag } = req.query;

        // 1. If neither is provided, return empty or error
        if (!q && !tag) {
            return res.status(400).json({ msg: 'Please provide a search query or tag' });
        }

        let filter = {};

        // 2. Handle Tag Filtering (If a tag is selected)
        if (tag) {
            // This handles both "Taekwondo" and "#Taekwondo" to match whatever is in your DB
            const cleanTag = tag.replace('#', ''); 
            filter.tags = { $in: [cleanTag, `#${cleanTag}`] };
        }

        // 3. Handle Text Search (If user typed something)
        if (q) {
            const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (tag) {
                // SCENARIO: Tag AND Text
                // We restrict the text search to content and author name only
                // (We don't need to search tags array for 'q' because we already filtered by specific tag above)
                filter.$or = [
                    { text: { $regex: safeQuery, $options: 'i' } }, // Searches Content
                    { tags: { $regex: safeQuery, $options: 'i' } }, // Searches Tags
                    { name: { $regex: safeQuery, $options: 'i' } }  // Searches Name
                ];
            } else {
                // SCENARIO: Text Only (Global Search)
                // Search everywhere: Content, Name, AND Tags
                filter.$or = [
                    { text: { $regex: safeQuery, $options: 'i' } },
                    { tags: { $regex: safeQuery, $options: 'i' } },
                    { name: { $regex: safeQuery, $options: 'i' } }
                ];
            }
        }

        const posts = await Post.find(filter)
            .sort({ date: -1 })
            .populate('user', ['name', 'avatar']);

        res.json(posts);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 5. GET A SINGLE POST
// GET /api/forum/:id
router.get('/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate('user', ['name', 'avatar'])
            .populate('comments.user', ['name', 'avatar']);
        
        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }
        
        res.json(post);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Post not found' });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 6. LIKE/UNLIKE A POST
// PUT /api/forum/like/:id
// Body: { userId }
router.put('/like/:id', async (req, res) => {
    try {
        // SECURITY FIX: Use req.user.id
        const userId = req.body.userId; 

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        // Check if user already liked
        const isLiked = post.likes.some(like => like.user.toString() === userId);

        if (isLiked) {
            // ATOMIC: Pull (Remove) the like
            await Post.findByIdAndUpdate(req.params.id, {
                $pull: { likes: { user: userId } }
            });
        } else {
            // ATOMIC: AddToSet (Add only if unique)
            await Post.findByIdAndUpdate(req.params.id, {
                $addToSet: { likes: { user: userId } }
            });
        }

        // Return the updated likes array
        const updatedPost = await Post.findById(req.params.id);
        res.json(updatedPost.likes);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 7. ADD A COMMENT
// POST /api/forum/comment/:id
// Body: { userId, text }
router.post('/comment/:id', async (req, res) => {
    try {
        const user = await User.findById(req.body.userId).select('-password');
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }

        const newComment = {
            text: req.body.text,
            name: user.name,
            avatar: user.avatar,
            user: req.body.userId
        };

        post.comments.unshift(newComment);
        await post.save();

        res.json(post.comments);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 8. DELETE A COMMENT
// DELETE /api/forum/comment/:id/:comment_id
// Body: { userId }
router.delete('/comment/:id/:comment_id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }

        const comment = post.comments.find(
            comment => comment.id === req.params.comment_id
        );

        if (!comment) {
            return res.status(404).json({ msg: 'Comment not found' });
        }

        // Check if user owns the comment
        if (comment.user.toString() !== req.body.userId) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        post.comments = post.comments.filter(
            comment => comment.id !== req.params.comment_id
        );

        await post.save();
        res.json(post.comments);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// 9. DELETE A POST
// DELETE /api/forum/:id
// Body: { userId }
router.delete('/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }

        // Check if user owns the post
        if (post.user.toString() !== req.body.userId) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Delete image file if exists
        if (post.image) {
            const imagePath = path.join(__dirname, '..', post.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await post.deleteOne();
        res.json({ msg: 'Post removed' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;