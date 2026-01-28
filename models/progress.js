const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define a Sub-Schema for the individual form data
const FormProgressSchema = new Schema({
    poomsae: {
        type: String,
        required: true,
        trim: true
    },
    techniques: {
        type: Map,
        of: Number,
        default: {}
    },
    kicks: {
        type: Map,
        of: Number,
        default: {}
    },
    totalScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0.0 }
}, { timestamps: true }); // Each form gets its own updated time

const ProgressSchema = new Schema({
    // The Trainee ID is now the main unique identifier for this document
    trainee: {
        type: Schema.Types.ObjectId,
        ref: 'Trainee',
        required: true,
        unique: true // Ensures only ONE document per trainee exists
    },
    // We store all the forms in this list
    forms: [FormProgressSchema],

    // === NEW ATTRIBUTE ===
    // Stores the average percentage across all forms (0.0 to 1.0)
    overallAverage: { 
        type: Number, 
        default: 0.0 
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Progress', ProgressSchema);