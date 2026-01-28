const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SessionSchema = new Schema({
    trainer: {
        type: String,
        required: [true, 'Trainer name is required'],
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Date is required']
    },
    // We replace the generic 'date' and string 'time' with actual Date objects
    // This captures both the Calendar Date and the Time (e.g., 2023-11-20T18:00:00.000Z)
    startTime: {
        type: Date,
        required: [true, 'Start time is required']
    },
    endTime: {
        type: Date,
        required: [true, 'End time is required']
    },
    venue: {
        type: String,
        required: [true, 'Venue is required'],
        trim: true
    },
    totalTrainees: {
        type: Number,
        required: [true, 'Total number of trainees is required'],
        min: [1, 'Must have at least one trainee']
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Index for sorting by date (newest sessions first)
SessionSchema.index({ date: -1 });

module.exports = mongoose.model('Session', SessionSchema);