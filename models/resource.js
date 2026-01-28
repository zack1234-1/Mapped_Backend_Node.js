const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ResourceSchema = new Schema({
    title: {
        type: String,
        required: [true, 'Title/Caption is required'],
        trim: true,
        maxlength: [300, 'Caption cannot exceed 300 characters']
    },
    type: {
        type: String,
        required: [true, 'Resource type is required'],
        trim: true,
        enum: {
            values: ['Image', 'Video', 'Link', 'Text'],
            message: '{VALUE} is not a valid resource type'
        }
    },
    url: {
        type: String,
        required: [true, 'Media URL or Path is required'],
        trim: true
    },

    tags: {
        type: [String], // Array of strings
        default: []
    },

    location: {
        type: String,
        trim: true,
        default: 'Johor Bahru, Malaysia' // Default per your UI
    },
    author: {
        type: String,
        default: 'Lieyza Wahab', // Hardcoded based on your UI, or pass dynamically
        trim: true
    },
    subtitle: {
        type: String,
        trim: true,
        default: '' // Optional subtitle
    },

    description: {
        type: String,
        trim: true,
        default: '' // Optional description
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for sorting and filtering
ResourceSchema.index({ type: 1 });
ResourceSchema.index({ createdAt: -1 });

ResourceSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Resource', ResourceSchema);