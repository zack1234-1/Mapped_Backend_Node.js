const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define a Sub-Schema for the individual form data
const FormProgressSchema = new Schema({
    form: {
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
    trainee: {
        type: Schema.Types.ObjectId,
        ref: 'Trainee',
        required: true
    },
    beltColor: {
        type: String,
        required: true,
        trim: true
    },
    forms: [FormProgressSchema],
    overallAverage: { 
        type: Number, 
        default: 0.0 
    }
}, {
    timestamps: true
});

// Compound unique index for trainee and beltColor
ProgressSchema.index({ trainee: 1, beltColor: 1 }, { unique: true });

module.exports = mongoose.model('Progress', ProgressSchema);