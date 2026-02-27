const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FlowItemSchema = new Schema({
    desc: { type: String, trim: true, default: '' },
    time: { type: Number, default: 0 }
}, { _id: false });

const ReflectionSchema = new Schema({
    rating: { type: Number, default: 0 },
    highlights: { type: String, trim: true, default: '' },
    improvements: { type: String, trim: true, default: '' },
    actionItems: [{ type: String, trim: true }]
}, { _id: false });

const SessionSchema = new Schema({

    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Trainer ID is required']
    },
    trainer: {
        type: String,
        required: [true, 'Trainer name is required'],
        trim: true
    },
    
    date: {
        type: Date,
        required: [true, 'Date is required']
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
    },
    level: { 
        type: String,
    },
    duration: { 
        type: Number,
        required: [true, 'Duration is required'], // Made required
        trim: true
    },
    sessionNo: { type: Number, trim: true },
    ageRange: { type: String, trim: true },
    riskAssessment: { type: String, trim: true, default: '' },
    resources: { type: String, trim: true, default: '' },
    othersInvolved: { type: String, trim: true, default: '' },
    goals: { 
        type: String, 
        trim: true, 
        required: [true, 'Session goals are required'] 
    },
    warmup: { type: FlowItemSchema, default: {} },
    activity: { type: FlowItemSchema, default: {} },
    cooldown: { type: FlowItemSchema, default: {} },
    contingencies: { type: String, trim: true, default: '' },
    reflection: { type: ReflectionSchema, default: {} }

}, {
    timestamps: true 
});

SessionSchema.index({ date: -1 });

module.exports = mongoose.model('Session', SessionSchema);