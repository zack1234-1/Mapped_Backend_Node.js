const mongoose = require('mongoose');

const CoachBotUsageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    userMessage: {
        type: String,
        required: true,
        maxlength: 500
    },
    
    botResponse: {
        type: String,
        required: true
    },
    
    tokensUsed: {
        prompt_tokens: { type: Number, default: 0 },
        completion_tokens: { type: Number, default: 0 },
        total_tokens: { type: Number, default: 0 }
    },
    
    model: {
        type: String,
        default: 'openai/gpt-oss-120b'
    },
    
    // Enhanced fields for analytics
    responseTime: {
        type: Number, // milliseconds
        default: 0
    },
    
    userContext: {
        beltLevel: {
            type: String,
            default: null
        },
        role: {
            type: String,
            default: 'coach'
        },
        sessionCount: {
            type: Number,
            default: 0
        }
    },
    
    queryCategory: {
        type: String,
        enum: [
            'session_planning',
            'technique',
            'belt_requirements',
            'sparring',
            'forms',
            'safety',
            'general',
            'other'
        ],
        default: 'general'
    },
    
    userSatisfaction: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    
    cached: {
        type: Boolean,
        default: false
    },
    
    preset: {
        type: Boolean,
        default: false
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
CoachBotUsageSchema.index({ userId: 1, createdAt: -1 });
CoachBotUsageSchema.index({ queryCategory: 1, createdAt: -1 });
CoachBotUsageSchema.index({ 'userContext.beltLevel': 1 });

// Auto-categorize queries before saving
CoachBotUsageSchema.pre('save', async function() {
    if (!this.userMessage) return;

    const message = this.userMessage.toLowerCase();
    
    if (message.includes('session') || message.includes('plan') || message.includes('training')) {
        this.queryCategory = 'session_planning';
    } else if (message.includes('kick') || message.includes('punch') || message.includes('technique')) {
        this.queryCategory = 'technique';
    } else if (message.includes('belt') || message.includes('requirement') || message.includes('promotion')) {
        this.queryCategory = 'belt_requirements';
    } else if (message.includes('spar') || message.includes('fight') || message.includes('competition')) {
        this.queryCategory = 'sparring';
    } else if (message.includes('form') || message.includes('poomsae') || message.includes('tul')) {
        this.queryCategory = 'forms';
    } else if (message.includes('safe') || message.includes('injury') || message.includes('prevent')) {
        this.queryCategory = 'safety';
    }
});

// Static method for analytics
CoachBotUsageSchema.statics.getUsageStats = async function(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalQueries: { $sum: 1 },
                totalTokens: { $sum: '$tokensUsed.total_tokens' },
                avgResponseTime: { $avg: '$responseTime' },
                cachedResponses: {
                    $sum: { $cond: ['$cached', 1, 0] }
                },
                categories: {
                    $push: '$queryCategory'
                }
            }
        }
    ]);
    
    return stats[0] || {};
};

// Static method to get popular queries
CoachBotUsageSchema.statics.getPopularQueries = async function(limit = 10) {
    return this.aggregate([
        {
            $group: {
                _id: '$userMessage',
                count: { $sum: 1 },
                avgTokens: { $avg: '$tokensUsed.total_tokens' }
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: limit
        }
    ]);
};

module.exports = mongoose.model('CoachBotUsage', CoachBotUsageSchema);