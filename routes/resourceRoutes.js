const express = require('express');
const Resource = require('../models/resource');

// Helper: Capitalize first letter (Title Case)
const toTitleCase = (str) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// --- NEW HELPER: Extract Hashtags (Keeps the '#') ---
const extractHashtags = (text) => {
    if (!text) return [];
    // Regex to find #tag, #tag_name, #tag123
    const matches = text.match(/#[a-z0-9_]+/gi);
    
    // Return empty array if no matches, otherwise return the array of tags
    // (We do NOT remove the '#' here because you want to save ["#world"])
    if (!matches) return [];
    
    // Optional: Remove duplicates using Set
    return [...new Set(matches)];
};

// Helper: Format Date for JSON response (matches your Trainee logic)
const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

module.exports = (asyncHandler) => {
    const router = express.Router();

    // POST /api/resource - Create new resource (Post)
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== RESOURCE CREATE REQUEST START ===');
        console.log('📥 Received body:', req.body);

        let {
            title, // This maps to 'text' from your Flutter CreatePostScreen
            type,  // 'image', 'link', etc.
           imageUrls, 
           videoUrls, 
           linkUrl,   // This maps to 'image' path/url from Flutter
            author,
            tag,
            description
        } = req.body;

         // 1. Validate required fields
        if (!title || !type) {
            console.log('❌ Missing title or type');
            return res.status(400).json({
                success: false,
                msg: 'Title and Type are required'
            });
        }

        // Ensure arrays are initialized if missing
        if (!imageUrls) imageUrls = [];
        if (!videoUrls) videoUrls = [];
        if (!linkUrl) linkUrl = "";

        // 2. Format Type to Title Case (e.g., "image" -> "Image") to match Enum
        type = toTitleCase(type);

        const fullText = (title + ' ' + (description || '')).trim();
        const extractedTags = extractHashtags(fullText);

        try {
            // Create new Resource
            const resource = new Resource({
                title,
                description,
                type,
                imageUrls, // Save specific image URLs
                videoUrls, // Save specific video URLs
                linkUrl,
                tags: extractedTags, // --- STEP 2: SAVE TO DB ---
                author: author || 'Lieyza Wahab',
            });

            console.log('3. Saving resource to database...');
            await resource.save();

            console.log('✅ Resource saved with ID:', resource._id);

            return res.status(201).json({
                success: true,
                msg: 'Resource posted successfully',
                data: {
                    id: resource._id,
                    title: resource.title,
                    description: resource.description,
                    type: resource.type,
                    imageUrls: resource.imageUrls,
                    videoUrls: resource.videoUrls,
                    linkUrl: resource.linkUrl,
                    tags: resource.tags, // You will see ["#world"] here
                    createdAt: formatDate(resource.createdAt)
                }
            });

        } catch (err) {
            console.error('💥 ERROR in resource creation:', err);
            
            if (err.name === 'ValidationError') {
                const errors = Object.values(err.errors).map(e => e.message);
                return res.status(400).json({
                    success: false,
                    msg: 'Validation Error',
                    errors: errors
                });
            }
            next(err);
        } finally {
            console.log('=== RESOURCE CREATE REQUEST END ===');
        }
    }));

    // GET /api/resource - Get all resources
    // Optional Query: /api/resource?type=Image
   router.get('/', asyncHandler(async (req, res, next) => {
        console.log('📥 GET request for resources', req.query);
        
        try {
            let query = {};
            
            // 1. Search Logic (Title, Description, or Tag)
            if (req.query.search) {
                const searchRegex = new RegExp(req.query.search, 'i'); // Case insensitive
                query.$or = [
                    { title: searchRegex },
                    { description: searchRegex },
                    { tags: searchRegex }
                ];
            }

            // 2. Filter by Specific Tag (Exact Match)
            if (req.query.tag) {
                query.tags = req.query.tag;
            }

            // 3. Filter by Type
            if (req.query.type && req.query.type !== 'All') {
                query.type = toTitleCase(req.query.type);
            }

            const resources = await Resource.find(query)
                .sort({ createdAt: -1 })
                .select('-__v')
                .lean();

            console.log(`✅ Found ${resources.length} resources`);

             const formattedResources = resources.map(r => {
                // Determine if local file based on imageUrls
                // (Since videos/links are usually external or handled differently)
                let isLocal = false;
                if (r.imageUrls && r.imageUrls.length > 0) {
                    isLocal = !r.imageUrls[0].startsWith('http');
                }

                return {
                    ...r,
                    id: r._id,
                    date: formatDate(r.createdAt),
                    isLocalFile: isLocal,
                    // Ensure generic 'urls' field exists for older UI compatibility if needed
                    urls: r.imageUrls.length > 0 ? r.imageUrls : (r.videoUrls.length > 0 ? r.videoUrls : (r.linkUrl ? [r.linkUrl] : []))
                };
            });

            res.json({
                success: true,
                count: formattedResources.length,
                data: formattedResources
            });

        } catch (err) {
            console.error('💥 Error fetching resources:', err);
            next(err);
        }
    }));

    // --- ADD THIS NEW ROUTE ---
    // GET /api/resource/tags - Get all unique tags
    router.get('/tags', asyncHandler(async (req, res, next) => {
        try {
            // Get distinct tags from all documents
            const tags = await Resource.distinct('tags');
            
            res.json({
                success: true,
                count: tags.length,
                data: tags
            });
        } catch (err) {
            next(err);
        }
    }));

    // DELETE /api/resource/:id
    router.delete('/:id', asyncHandler(async (req, res, next) => {
        const id = req.params.id;
        console.log('📥 DELETE request for resource ID:', id);

        try {
            const resource = await Resource.findByIdAndDelete(id);

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    msg: 'Resource not found'
                });
            }

            console.log('✅ Resource deleted:', resource.title);
            res.json({
                success: true,
                msg: 'Resource deleted successfully',
                data: { id: resource._id }
            });

        } catch (err) {
            console.error('💥 Error deleting resource:', err);
            if (err.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }
            next(err);
        }
    }));

    return router;
};