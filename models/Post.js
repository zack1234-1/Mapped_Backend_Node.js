const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  text: {
    type: String,
    required: true
  },
  name: {
    type: String
  },
  avatar: {
    type: String
  },
  // Single image
  image: {
    type: String,
    default: ''
  },
  // Multiple images
  images: {
    type: [String],
    default: []
  },
  // Video fields
  videoUrl: {
    type: String,
    default: ''
  },
  videoThumbnail: {
    type: String,
    default: ''
  },
  // Tags/Hashtags
  tags: {
    type: [String],
    default: []
  },
  // Likes
  likes: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],
  // Comments
  comments: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      text: {
        type: String,
        required: true
      },
      name: {
        type: String
      },
      avatar: {
        type: String
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],
  // Reports
  reports: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: {
        type: String,
        required: true
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],
  // Pin status
  isPinned: {
    type: Boolean,
    default: false
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', PostSchema);