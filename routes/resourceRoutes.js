const express = require('express');
const router = express.Router();
const Resource = require('../models/resource');
const User = require('../models/User'); 
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');

// --- MULTER SETUP (Memory storage for Cloudinary) ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// --- HELPER FUNCTION: TRANSFORM RESOURCE ---
// We use this for both GET / and GET /search to ensure consistency
const transformResource = (resource, req) => {
    const resourceObj = resource.toJSON();
    
    // 1. Ensure string fields have defaults
    resourceObj.title = resourceObj.title || '';
    resourceObj.description = resourceObj.description || '';
    resourceObj.authorName = resourceObj.authorName || 'Unknown';
    resourceObj.author = resourceObj.author || 'Unknown';
    resourceObj.type = resourceObj.type || 'Text';
    
    // 2. Ensure arrays have defaults
    resourceObj.tags = resourceObj.tags || [];
    resourceObj.imageUrls = resourceObj.imageUrls || [];
    resourceObj.videoUrls = resourceObj.videoUrls || [];
    
    // 3. Transform Image URLs (Relative -> Full)
    if (resourceObj.imageUrls.length > 0) {
        resourceObj.imageUrls = resourceObj.imageUrls.map(imagePath => {
            if (imagePath.startsWith('http')) return imagePath;
            const cleanPath = imagePath.replace(/^\//, '');
            return `${req.protocol}://${req.get('host')}/${cleanPath}`;
        });
    }
    
    // 4. Transform Author Image
    if (resourceObj.authorImage && !resourceObj.authorImage.startsWith('http')) {
        const cleanPath = resourceObj.authorImage.replace(/^\//, '');
        resourceObj.authorImage = `${req.protocol}://${req.get('host')}/${cleanPath}`;
    }

    // 5. VIDEO FIX: Map videoUrls[0] -> videoUrl for Frontend
    if (resourceObj.videoUrls.length > 0) {
        resourceObj.videoUrl = resourceObj.videoUrls[0];
    } else if (resourceObj.videoUrl) {
        // Keep existing videoUrl if it exists
        resourceObj.videoUrl = resourceObj.videoUrl; 
    }

    return resourceObj;
};

// 1. CREATE RESOURCE
router.post('/', upload.any(), async (req, res) => {
    try {
        console.log('📥 CREATE RESOURCE - Received body:', JSON.stringify(req.body, null, 2));
        
        const { userId, title, content, description, text, videoUrl, resourceType, type } = req.body;
        const finalContent = description || text || content || title;

        if (!userId) return res.status(400).json({ msg: 'Missing userId' });
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ msg: 'Invalid userId format' });

        const user = await User.findById(userId).select('name avatar username');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Upload images to Cloudinary
        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const uploadResult = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            { folder: 'resources' },
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

        let videoUrls = [];
        if (videoUrl && videoUrl.trim() !== '') {
            videoUrls.push(videoUrl.trim());
        }

        // Handle Tags
        let tags = [];
        if (req.body.tags) {
            let rawTags = Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',');
            tags = rawTags
                .map(tag => tag.trim().toLowerCase())
                .map(tag => tag.replace(/^#/, '')) 
                .filter(tag => tag.length > 0);
            tags = [...new Set(tags)];
        }

        // Ensure arrays are initialized if missing
        if (!imageUrls) imageUrls = [];
        if (!videoUrls) videoUrls = [];
        if (!linkUrl) linkUrl = "";

        // Determine Type
        let finalType = 'Text';
        const inputType = type || resourceType;
        if (inputType) {
            finalType = inputType.charAt(0).toUpperCase() + inputType.slice(1).toLowerCase();
        } else if (imageUrls.length > 0) {
            finalType = 'Image';
        } else if (videoUrls.length > 0) {
            finalType = 'Video';
        } else if ((finalContent || '').match(/https?:\/\//)) {
            finalType = 'Link';
        }

        const newResource = new Resource({
            title: title || 'Untitled',
            description: finalContent || title,
            type: finalType,
            author: user.name || user.username,
            authorId: userId,
            authorName: user.name || user.username,
            authorImage: user.avatar,
            imageUrls: imageUrls,
            videoUrls: videoUrls,
            tags: tags
        });

        const savedResource = await newResource.save();
        // Transform response so frontend gets correct URLs immediately
        res.status(201).json(transformResource(savedResource, req));

    } catch (err) {
        console.error('❌ Create Resource Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 2. GET ALL RESOURCES
router.get('/', async (req, res) => {
    try {
        const { type } = req.query;
        let query = {};

        if (type && type !== 'All') {
            const typeMapping = { 'Images': 'Image', 'Videos': 'Video', 'Links': 'Link', 'Text': 'Text' };
            query.type = typeMapping[type] || type;
        }

        const resources = await Resource.find(query).sort({ isPinned: -1, createdAt: -1 });
        
        // Use helper to transform
        const transformedResources = resources.map(resource => transformResource(resource, req));
        
        res.json(transformedResources);
    } catch (err) {
        console.error('Get Resources Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 3. GET POPULAR TAGS
router.get('/tags', async (req, res) => {
    try {
        const tags = await Resource.aggregate([
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

// 4. SEARCH RESOURCES
router.get('/search', async (req, res) => {
    try {
        const { q, tag } = req.query;

        if (!q && !tag) return res.status(400).json({ msg: 'No query or tag provided' });

        let query = {};
        if (tag) query.tags = { $regex: tag, $options: 'i' };
        if (q) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { tags: { $regex: q, $options: 'i' } },
                { authorName: { $regex: q, $options: 'i' } }
            ];
        }

        const resources = await Resource.find(query).sort({ isPinned: -1, createdAt: -1 });
        
        // FIX: Applied transformation to search results too!
        const transformedResources = resources.map(resource => transformResource(resource, req));
        
        res.json(transformedResources);
    } catch (err) {
        console.error('Search Resources Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 5. GET SINGLE RESOURCE
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ msg: 'Resource not found (Invalid ID)' });
        }

        const resource = await Resource.findByIdAndUpdate(
            req.params.id,
            { $inc: { viewCount: 1 } },
            { new: true }
        );

        if (!resource) return res.status(404).json({ msg: 'Resource not found' });
        
        // Use helper to transform
        res.json(transformResource(resource, req));
    } catch (err) {
        console.error('Get Single Resource Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// 8. DELETE RESOURCE
router.delete('/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ msg: 'Missing userId' });

        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ msg: 'Resource not found' });

        if (resource.authorId.toString() !== userId) {
            return res.status(401).json({ msg: 'User not authorized to delete this resource' });
        }

        if (resource.imageUrls && resource.imageUrls.length > 0) {
            resource.imageUrls.forEach(imagePath => {
                // Remove URL prefix to get file path if necessary, or check relative path
                // This assumes imagePath stored in DB is relative "uploads/..."
                if (!imagePath.startsWith('http') && fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            });
        }

        await Resource.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Resource deleted successfully' });
    } catch (err) {
        console.error('Delete Resource Error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;