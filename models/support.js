const mongoose = require('mongoose');

const supportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
    },
    status: {
      type: String,
      enum: ['pending','resolved'],
      default: 'pending',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    responses: [
      {
        message: {
          type: String,
          required: true,
        },
        respondedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        respondedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolvedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
supportSchema.index({ userId: 1, createdAt: -1 });
supportSchema.index({ status: 1, createdAt: -1 });

// Virtual for getting ticket age
supportSchema.virtual('age').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to add response
supportSchema.methods.addResponse = function (message, userId) {
  this.responses.push({
    message,
    respondedBy: userId,
  });
  return this.save();
};

// Method to update status
supportSchema.methods.updateStatus = function (status) {
  this.status = status;
  if (status === 'resolved') {
    this.resolvedAt = Date.now();
  }
  return this.save();
};

module.exports = mongoose.model('Support', supportSchema);