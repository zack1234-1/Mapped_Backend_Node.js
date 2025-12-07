const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User' // Connects to your User model
  },
  text: {
    type: String,
    required: true
  },
  image: {
    type: String // Optional URL for post image
  },
  images: [
    { type: String }
  ],
  videoUrl: { 
    type: String 
  },  
  videoThumbnail: { 
    type: String 
  },
  tags: [String], // Array of tags like ["#Taekwondo", "#Training"]
  likes: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  ],
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
      name: String,
      avatar: String,
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', PostSchema);