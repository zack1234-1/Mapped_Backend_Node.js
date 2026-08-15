const express = require('express');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const CoachBotUsage = require('../models/CoachBotUsage');

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key_if_not_set' 
});

// ============================================
// COST OPTIMIZATION: Token Management
// ============================================
const TOKEN_LIMITS = {
    MAX_HISTORY_MESSAGES: 6, // Reduced from 10
    MAX_TOKENS_PER_REQUEST: 600, // Reduced from 800
    COMPRESSION_THRESHOLD: 5
};

// ============================================
// CACHING: Reduce API Calls
// ============================================
const responseCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

function getCacheKey(message, history) {
    const historyHash = history.slice(-3).map(h => h.content).join('|');
    return `${message.toLowerCase().trim()}:${historyHash}`;
}

function getCachedResponse(key) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.response;
    }
    responseCache.delete(key);
    return null;
}

// ============================================
// ENHANCED SYSTEM PROMPT
// ============================================
function getSystemPrompt(userContext = {}) {
    const { beltLevel, role, sessionCount } = userContext;
    
    let contextualInfo = '';
    if (beltLevel) {
        contextualInfo += `\nCurrent User Belt: ${beltLevel}`;
    }
    if (role === 'coach') {
        contextualInfo += '\nUser Role: Coach (provide advanced coaching insights)';
    }
    if (sessionCount !== undefined) {
        contextualInfo += `\nUser has conducted ${sessionCount} sessions`;
    }

    return `You are a Taekwondo Coach Assistant for "Mapped".
Region: Europe (WTF). Belts: White, Yellow, Green, Blue, Brown, Black.

**EXPERTISE:**
1. **Session Planning**: Warm-ups, Drills, Sparring, Cool-down.
2. **Technique**: Kicks, Poomsae (Taegeuk 1-8), Sparring rules.
3. **Safety**: Injury prevention.

**APP NAVIGATION:**
- 5 Tabs: **Home, Session, Forum, CoachBot, Account**.
- **To Plan a Session**: Go to **Home** > "**Plan a Session**".
- Required Fields: Date, Venue, Duration, Participants, Session #, Age, Risk Assessment, Resources, Others Involved, Goals, Warm Up, Activity, Cool Down, Contingencies.

**GUIDELINES:**
- Concise, professional, encouraging.
- If asked, guide users to "Plan a Session" on Home tab.
- Redirect non-Taekwondo topics.
${contextualInfo}`;
}

// ============================================
// HISTORY COMPRESSION
// ============================================
function compressHistory(history) {
    if (history.length <= TOKEN_LIMITS.MAX_HISTORY_MESSAGES) {
        return history;
    }
    return history.slice(-TOKEN_LIMITS.MAX_HISTORY_MESSAGES);
}

// ============================================
// RESPONSE GENERATION
// ============================================
async function generateResponse(message, history, userContext) {
    const compressedHistory = compressHistory(history);
    
    const messages = [
        { role: "system", content: getSystemPrompt(userContext) },
        ...compressedHistory,
        { role: "user", content: message }
    ];

    const isSimpleQuery = message.split(' ').length < 10;
    const model = isSimpleQuery 
        ? "openai/gpt-oss-20b"
        : "openai/gpt-oss-120b";

    const completion = await groq.chat.completions.create({
        messages: messages,
        model: model,
        temperature: 0.7,
        max_tokens: TOKEN_LIMITS.MAX_TOKENS_PER_REQUEST,
        top_p: 0.9,
        stream: false,
    });

    return {
        content: completion.choices[0]?.message?.content || 
                 "I apologize, but I couldn't generate a response. Please try rephrasing your question.",
        usage: completion.usage || {},
        model: completion.model
    };
}

// ============================================
// PRESET RESPONSES
// ============================================
const PRESET_RESPONSES = {
    'warm-up': {
        content: `**Essential Taekwondo Warm-up Routine (10-15 minutes):**

1. **Light Cardio (3-5 min)**
   - Jogging in place or around the dojang
   - Jumping jacks: 2 sets of 20

2. **Dynamic Stretching (5-7 min)**
   - Leg swings: Forward/back, side-to-side (10 each leg)
   - Hip rotations: 10 clockwise, 10 counter-clockwise
   - Arm circles: 15 forward, 15 backward
   - Walking lunges with torso twist: 10 each side

3. **Taekwondo-Specific Movements (3-5 min)**
   - Front kicks (low height): 10 each leg
   - Knee raises: 15 each leg
   - Basic stances: Walking stance → Front stance → Back stance (flow drill)

**Key Tip:** Never skip warm-ups! Properly warmed muscles reduce injury risk by 50%.`,
        tokens: 0
    },
    'belt requirements': {
        content: `**Belt Advancement System in Mapped:**

Our European WTF system uses 6 belt levels:

**White Belt** → Foundation
- Basic stances, front kick, low block
- Taegeuk Il Jang (Form 1)

**Yellow Belt** → Building Blocks
- Roundhouse kick, middle block, knife-hand
- Taegeuk Ee Jang (Form 2)

**Green Belt** → Growing Skills
- Side kick, back kick, high block
- Taegeuk Sam Jang (Form 3)

**Blue Belt** → Deepening Knowledge
- Axe kick, spinning techniques
- Taegeuk Sa Jang (Form 4)

**Brown Belt** → Pre-Black Belt Mastery
- Jump kicks, advanced combinations
- Taegeuk Oh Jang (Form 5)

**Black Belt** → Mastery & Beyond
- All techniques refined, teaching capability
- Koryo (Black Belt Form 1)

Each advancement requires: Technical proficiency + Knowledge test + Sparring demonstration + Instructor recommendation.`,
        tokens: 0
    },
    'session plan': {
        content: `**Sample 60-Minute Training Session:**

**Warm-up (10 min)**
- Light jogging & dynamic stretches

**Technique Focus (20 min)**
- Review: Front kicks (5 min)
- New: Roundhouse kick technique breakdown (15 min)
  * Chamber position, hip rotation, snap-back

**Drill Practice (15 min)**
- Kicking shields: 3 rounds of 10 kicks each leg
- Partner drills: Attack-counter exercises

**Poomsae/Forms (10 min)**
- Belt-appropriate form practice
- Corrections and refinement

**Cool-down (5 min)**
- Static stretching: Hamstrings, quads, hips
- Breathing exercises

**Tip:** Adjust timing based on student age and belt level!`,
        tokens: 0
    },
    'how to plan': {
        content: `**To Plan a Session in Mapped:**\n\n1. Go to **Home** tab.\n2. Tap "**Plan a Session**".\n3. Fill in: Date, Venue, Duration, Participants, Session #, Age, Risk, Resources, Others, Goals, Warm Up, Activity, Cool Down, Contingencies.`,
        tokens: 0
    },
    'plan a session': {
        content: `**To Plan a Session in Mapped:**\n\n1. Go to **Home** tab.\n2. Tap "**Plan a Session**".\n3. Fill in: Date, Venue, Duration, Participants, Session #, Age, Risk, Resources, Others, Goals, Warm Up, Activity, Cool Down, Contingencies.`,
        tokens: 0
    },
    'app navigation': {
        content: `**App Navigation (5 Tabs):**\n1. **Home**: Dashboard & Planning\n2. **Session**: Manage sessions\n3. **Forum**: Community\n4. **CoachBot**: AI Assistant\n5. **Account**: Settings`,
        tokens: 0
    }
};

function checkPresetResponse(message) {
    const lowerMessage = message.toLowerCase().trim();
    for (const [key, preset] of Object.entries(PRESET_RESPONSES)) {
        if (lowerMessage.includes(key)) {
            return preset;
        }
    }
    return null;
}

// ============================================
// ANALYTICS
// ============================================
async function getCoachingInsights(userId) {
    try {
        const recentUsage = await CoachBotUsage.find({ userId })
            .sort({ createdAt: -1 })
            .limit(50);

        const topics = {
            'session planning': 0,
            'technique': 0,
            'belt requirements': 0,
            'sparring': 0,
            'forms': 0
        };

        recentUsage.forEach(usage => {
            const msg = usage.userMessage.toLowerCase();
            Object.keys(topics).forEach(topic => {
                if (msg.includes(topic)) topics[topic]++;
            });
        });

        return {
            totalQueries: recentUsage.length,
            topTopics: Object.entries(topics)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([topic, count]) => ({ topic, count })),
            avgTokensPerQuery: recentUsage.reduce((sum, u) => 
                sum + (u.tokensUsed?.total_tokens || 0), 0) / recentUsage.length || 0
        };
    } catch (error) {
        console.error('Analytics error:', error);
        return null;
    }
}

// ============================================
// ROUTER IMPLEMENTATION
// ============================================
module.exports = (asyncHandler) => {
    const router = express.Router();

    // Main chat endpoint - FIXED VERSION
    router.post('/chat', asyncHandler(async (req, res) => {
        const { userId, message, history = [], userContext = {} } = req.body;

        console.log('📨 CoachBot Chat Request:', { userId, messageLength: message?.length });

        // Validation
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Message is required and cannot be empty' 
            });
        }

        if (message.length > 500) {
            return res.status(400).json({ 
                error: 'Message too long. Please keep questions under 500 characters.' 
            });
        }

        // Validate userId format (like in forum)
        if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                error: 'Invalid userId format' 
            });
        }

        // API Key validation
        if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy_key_if_not_set') {
            console.error('❌ GROQ_API_KEY is missing or invalid');
            return res.status(500).json({ 
                error: 'AI service is currently unavailable. Please contact support.' 
            });
        }

        try {
            let responseContent;
            let tokensUsed = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            let modelUsed = 'preset';
            let isCached = false;
            let isPreset = false;

            // Step 1: Check preset responses (zero cost)
            const presetResponse = checkPresetResponse(message);
            if (presetResponse) {
                console.log('⚡ Using preset response');
                responseContent = presetResponse.content;
                isPreset = true;
                isCached = true;
            } else {
                // Step 2: Check cache
                const cacheKey = getCacheKey(message, history);
                const cachedResponse = getCachedResponse(cacheKey);
                
                if (cachedResponse) {
                    console.log('💾 Using cached response');
                    responseContent = cachedResponse;
                    isCached = true;
                    modelUsed = 'cached';
                } else {
                    // Step 3: Generate AI response
                    console.log('🤖 Generating AI response...');
                    const { content, usage, model } = await generateResponse(
                        message, 
                        history, 
                        userContext
                    );

                    responseContent = content;
                    tokensUsed = usage;
                    modelUsed = model;

                    // Cache the response
                    responseCache.set(cacheKey, {
                        response: content,
                        timestamp: Date.now()
                    });

                    console.log(`✅ AI response generated with ${model}`);
                }
            }

            // Step 4: Save to database (SYNCHRONOUSLY like forum does)
            let savedToDb = false;
            if (userId) {
                try {
                    // Check if MongoDB is connected
                    if (mongoose.connection.readyState !== 1) {
                        console.error('❌ MongoDB not connected, skipping save');
                    } else {
                        const newUsage = new CoachBotUsage({
                            userId: userId,
                            userMessage: message,
                            botResponse: responseContent,
                            tokensUsed: {
                                prompt_tokens: tokensUsed.prompt_tokens || 0,
                                completion_tokens: tokensUsed.completion_tokens || 0,
                                total_tokens: tokensUsed.total_tokens || 0
                            },
                            model: modelUsed,
                            userContext: userContext,
                            cached: isCached,
                            preset: isPreset
                        });

                        const savedUsage = await newUsage.save();
                        savedToDb = true;
                        console.log('💾 Saved to database:', savedUsage._id);
                    }
                } catch (dbError) {
                    console.error("❌ CoachBot DB save error:", dbError.message);
                    // Don't fail the request if DB save fails
                }
            } else {
                console.log('⚠️ No userId provided, skipping database save');
            }

            // Return response
            res.json({
                response: responseContent,
                usage: tokensUsed,
                saved: savedToDb,
                cached: isCached,
                preset: isPreset,
                model: modelUsed
            });

        } catch (error) {
            console.error("❌ CoachBot Error:", error);
            
            if (error.status === 429) {
                return res.status(429).json({ 
                    error: "Too many requests. Please wait a moment and try again." 
                });
            }
            
            res.status(500).json({ 
                error: "I'm having trouble processing your request. Please try again.",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }));

    // Get conversation history
    router.get('/history/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;
        
        console.log('📜 Fetching history for userId:', userId);

        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid userId format' });
        }

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const history = await CoachBotUsage.find({ userId })
            .select('userMessage botResponse createdAt tokensUsed model cached preset')
            .sort({ createdAt: -1 })
            .limit(limit);
        
        console.log(`✅ Found ${history.length} conversations`);
        
        res.json({
            history: history,
            count: history.length
        });
    }));

    // Get coaching insights/analytics
    router.get('/insights/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;
        
        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid userId format' });
        }
        
        const insights = await getCoachingInsights(userId);
        
        res.json(insights || { 
            message: 'Not enough data for insights yet',
            totalQueries: 0,
            topTopics: [],
            avgTokensPerQuery: 0
        });
    }));

    // Quick suggestions endpoint
    router.get('/suggestions', asyncHandler(async (req, res) => {
        const { context } = req.query;
        
        const suggestions = {
            general: [
                "Help me plan a beginner session",
                "What are the belt requirements?",
                "Show me a warm-up routine",
                "How do I teach roundhouse kicks?"
            ],
            session: [
                "Create a 45-minute intermediate session",
                "Suggest drills for improving speed",
                "What's a good cool-down routine?"
            ],
            technique: [
                "Explain proper axe kick form",
                "Common mistakes in sparring?",
                "How to improve flexibility for high kicks?"
            ]
        };

        res.json(suggestions[context] || suggestions.general);
    }));

    // Health check endpoint
    router.get('/health', asyncHandler(async (req, res) => {
        const isApiConfigured = process.env.GROQ_API_KEY && 
                               process.env.GROQ_API_KEY !== 'dummy_key_if_not_set';
        const isDbConnected = mongoose.connection.readyState === 1;

        res.json({
            status: isApiConfigured && isDbConnected ? 'healthy' : 'degraded',
            ai: isApiConfigured ? 'configured' : 'not_configured',
            database: isDbConnected ? 'connected' : 'disconnected',
            cache_size: responseCache.size
        });
    }));

    return router;
};