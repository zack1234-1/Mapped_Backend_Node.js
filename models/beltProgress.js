const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- Sub-Schemas for Each Belt ---

// White (W)
const WhiteBeltSchema = new Schema({
    planSessionCount: { type: Number, default: 0 },
    activeDayCount: { type: Number, default: 0 },
    openResourceCount: { type: Number, default: 0 },
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

// Yellow (Y)
const YellowBeltSchema = new Schema({
    planSessionCount: { type: Number, default: 0 },
    activeDayCount: { type: Number, default: 0 },
    recommendationCount: { type: Number, default: 0 },
    sessionPhotoCount: { type: Number, default: 0 },
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

// Green (G)
const GreenBeltSchema = new Schema({
    planSessionCount: { type: Number, default: 0 },
    activeDayCount: { type: Number, default: 0 },
    recommendationCount: { type: Number, default: 0 },
    writeShortDescriptionCount: { type: Number, default: 0 },
    postCount: { type: Number, default: 0 },
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

// Blue (B)
const BlueBeltSchema = new Schema({
    planSessionCount: { type: Number, default: 0 },
    activeDayCount: { type: Number, default: 0 },
    shareTipCount: { type: Number, default: 0 },
    postCount: { type: Number, default: 0 },
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

// Brown (R)
const BrownBeltSchema = new Schema({
    planSessionCount: { type: Number, default: 0 },
    activeDayCount: { type: Number, default: 0 },
    recommendationCount: { type: Number, default: 0 },
    shareTipCount: { type: Number, default: 0 },
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

// Black (L)
const BlackBeltSchema = new Schema({
    progressPercentage: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false }
}, { _id: false });

const BeltProgressSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    belts: {
        W: { type: WhiteBeltSchema, default: () => ({}) },
        Y: { type: YellowBeltSchema, default: () => ({}) },
        G: { type: GreenBeltSchema, default: () => ({}) },
        B: { type: BlueBeltSchema, default: () => ({}) },
        R: { type: BrownBeltSchema, default: () => ({}) },
        L: { type: BlackBeltSchema, default: () => ({}) }
    }
}, { timestamps: true });

module.exports = mongoose.model('BeltProgress', BeltProgressSchema);