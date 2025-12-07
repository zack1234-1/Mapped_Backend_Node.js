const mongoose = require('mongoose');

const BeltProgressRingSchema = new mongoose.Schema({
    beltName: {
        type: String,
        required: true,
        unique: true, // e.g., "White", "Yellow"
        trim: true
    },
    // Stored as an integer (0-100) to match your UI requirements
    averagePercentage: {
        type: Number,
        default: 0
    },
    traineeCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('BeltProgressRing', BeltProgressRingSchema);