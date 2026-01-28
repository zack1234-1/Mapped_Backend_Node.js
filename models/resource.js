const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ResourceSchema = new Schema({
     author: {
        type: String,
        default: 'Lieyza Wahab', 
        trim: true
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

    title: {
        type: String,
        required: [true, 'Title/Caption is required'],
        trim: true,
        maxlength: [300, 'Caption cannot exceed 300 characters']
    },

    description: {
        type: String,
        trim: true,
        default: '' 
    },


    tags: {
        type: [String], 
        default: []
    },
    
    imageUrls: {
        type: [String], 
        default: [] 
    },
    
    videoUrls: {
        type: [String], 
        default: [] 
    },

    linkUrl: {
        type: String,
        trim: true,
        default: ''
    },
   
}, {
    timestamps: true 
});

// Indexes for sorting and filtering
ResourceSchema.index({ type: 1 });
ResourceSchema.index({ createdAt: -1 });

ResourceSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Resource', ResourceSchema);