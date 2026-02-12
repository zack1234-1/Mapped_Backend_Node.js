const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RecommendationSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Recommendation metadata
    recommendationDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        index: true
    },
    
    // Analysis context
    analysisContext: {
        totalSessionsAnalyzed: { type: Number, default: 0 },
        recentSessionsCount: { type: Number, default: 0 },
        userBeltLevel: { type: String, default: 'White' },
        userRole: { type: String, default: 'trainee' },
        lastSessionDate: { type: Date },
        daysSinceLastSession: { type: Number, default: 0 },
        averageSessionDuration: { type: Number, default: 60 },
        commonVenues: [{ type: String }],
        typicalTraineeCount: { type: Number }
    },
    
    // Session patterns identified
    patterns: {
        preferredLevel: { type: String },
        commonAgeRange: { type: String },
        frequentGoals: [{ type: String }],
        successfulActivities: [{ type: String }],
        areasNeedingImprovement: [{ type: String }],
        consistencyScore: { type: Number, min: 0, max: 100 }
    },
    
    // AI-generated recommendation
    recommendation: {
        // Suggested session details
        suggestedLevel: {
            type: String,
            enum: ['Beginner', 'Intermediate', 'Advanced'],
            default: 'Beginner'
        },
        
        suggestedDuration: { 
            type: Number, 
            default: 60 
        },
        
        recommendedVenue: { 
            type: String,
            default: '' 
        },
        
        suggestedAgeRange: { 
            type: String,
            default: '' 
        },
        
        suggestedTraineeCount: { 
            type: Number,
            default: 1 
        },
        
        // Session content recommendations
        goals: {
            primary: { type: String, default: '' },
            secondary: [{ type: String }],
            reasoning: { type: String, default: '' }
        },
        
        warmup: {
            description: { type: String, default: '' },
            suggestedTime: { type: Number, default: 10 },
            keyExercises: [{ type: String }]
        },
        
        activity: {
            description: { type: String, default: '' },
            suggestedTime: { type: Number, default: 35 },
            focusAreas: [{ type: String }],
            drills: [{ type: String }],
            progressionTips: [{ type: String }]
        },
        
        cooldown: {
            description: { type: String, default: '' },
            suggestedTime: { type: Number, default: 10 },
            keyExercises: [{ type: String }]
        },
        
        contingencies: {
            description: { type: String, default: '' },
            scenarios: [{
                situation: { type: String },
                solution: { type: String }
            }]
        },
        
        riskAssessment: {
            description: { type: String, default: '' },
            keyRisks: [{ type: String }],
            mitigationStrategies: [{ type: String }]
        },
        
        resources: {
            description: { type: String, default: '' },
            required: [{ type: String }],
            optional: [{ type: String }]
        }
    },
    
    // Personalized insights
    insights: {
        strengthAreas: [{ type: String }],
        improvementAreas: [{ type: String }],
        motivationalMessage: { type: String, default: '' },
        progressionPath: { type: String, default: '' },
        tipsForToday: [{ type: String }]
    },
    
    // AI model information
    aiMetadata: {
        model: { type: String, default: 'llama-3.3-70b-versatile' },
        tokensUsed: {
            prompt_tokens: { type: Number, default: 0 },
            completion_tokens: { type: Number, default: 0 },
            total_tokens: { type: Number, default: 0 }
        },
        generationTime: { type: Number, default: 0 }, // in milliseconds
        cached: { type: Boolean, default: false }
    },
    
    // User interaction
    userFeedback: {
        wasUseful: { type: Boolean },
        wasImplemented: { type: Boolean },
        rating: { type: Number, min: 1, max: 5 },
        comments: { type: String },
        feedbackDate: { type: Date }
    },
    
    // Status
    status: {
        type: String,
        enum: ['active', 'expired', 'implemented', 'dismissed'],
        default: 'active',
        index: true
    }
    
}, {
    timestamps: true
});

// Compound indexes for efficient queries
RecommendationSchema.index({ userId: 1, recommendationDate: -1 });
RecommendationSchema.index({ userId: 1, status: 1 });
RecommendationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Methods
RecommendationSchema.methods.isExpired = function() {
    return this.expiresAt < new Date();
};

RecommendationSchema.methods.markAsImplemented = async function() {
    this.status = 'implemented';
    this.userFeedback.wasImplemented = true;
    this.userFeedback.feedbackDate = new Date();
    return await this.save();
};

RecommendationSchema.methods.submitFeedback = async function(feedback) {
    this.userFeedback = {
        ...this.userFeedback,
        ...feedback,
        feedbackDate: new Date()
    };
    return await this.save();
};

// Statics
RecommendationSchema.statics.getLatestForUser = async function(userId) {
    return await this.findOne({ 
        userId, 
        status: 'active',
        expiresAt: { $gt: new Date() }
    }).sort({ recommendationDate: -1 });
};

RecommendationSchema.statics.getUserRecommendationHistory = async function(userId, limit = 10) {
    return await this.find({ userId })
        .sort({ recommendationDate: -1 })
        .limit(limit)
        .select('-aiMetadata -__v');
};

module.exports = mongoose.model('SessionRecommendation', RecommendationSchema);