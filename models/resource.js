const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  author: {
    type: String,
    default: ''
  },
  authorName: {
    type: String,
    default: ''
  },
  authorImage: {
    type: String,
    default: null
  },
  imageUrls: [{
    type: String
  }],
  videoUrls: [{
    type: String
  }],
  linkUrl: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  type: {  // Changed from 'resourceType'
    type: String,
    enum: ['Image', 'Video', 'Link', 'Text'],  // Capital first letters
    required: true,
    default: 'Text'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isReported: {
    type: Boolean,
    default: false
  },
  reportCount: {
    type: Number,
    default: 0
  },
  reports: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }],
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  collection: 'resources',  // Explicitly set collection name
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for timeAgo
resourceSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
});

// Index for faster queries
resourceSchema.index({ authorId: 1, createdAt: -1 });
resourceSchema.index({ tags: 1 });
resourceSchema.index({ type: 1 });  // Changed from resourceType
resourceSchema.index({ isPinned: -1, createdAt: -1 });

// Static method to get popular tags
resourceSchema.statics.getPopularTags = async function(limit = 10) {
  const result = await this.aggregate([
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { tag: '$_id', count: 1, _id: 0 } }
  ]);
  
  return result.map(r => r.tag);
};

const Resource = mongoose.model('Resource', resourceSchema);

module.exports = Resource;