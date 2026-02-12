const express = require('express');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const Session = require('../models/session');
const User = require('../models/User');
const SessionRecommendation = require('../models/sessionRecommendation');
const BeltProgress = require('../models/beltProgress');

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key_if_not_set'
});

// ============================================
// ANALYSIS HELPERS
// ============================================

/**
 * Analyze user's session history to extract patterns and insights
 */
async function analyzeSessionHistory(userId) {
    try {
        // Fetch sessions for the user (last 3 months)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const sessions = await Session.find({
            trainerId: userId,
            date: { $gte: threeMonthsAgo }
        }).sort({ date: -1 }).lean();

        if (sessions.length === 0) {
            return {
                hasHistory: false,
                totalSessions: 0,
                message: 'No previous sessions found'
            };
        }

        // Get recent sessions (last 5)
        const recentSessions = sessions.slice(0, 5);
        const lastSession = sessions[0];

        // Calculate patterns
        const analysis = {
            hasHistory: true,
            totalSessions: sessions.length,
            recentSessionsCount: recentSessions.length,
            
            // Temporal analysis
            lastSessionDate: lastSession.date,
            daysSinceLastSession: Math.floor(
                (new Date() - new Date(lastSession.date)) / (1000 * 60 * 60 * 24)
            ),
            
            // Session characteristics
            averageSessionDuration: calculateAverage(sessions, 'duration'),
            typicalTraineeCount: Math.round(calculateAverage(sessions, 'totalTrainees')),
            
            // Level distribution
            levelDistribution: calculateDistribution(sessions, 'level'),
            preferredLevel: getMostCommon(sessions, 'level'),
            
            // Venue patterns
            venueDistribution: calculateDistribution(sessions, 'venue'),
            commonVenues: getTopN(sessions, 'venue', 3),
            
            // Age range patterns
            ageRangeDistribution: calculateDistribution(sessions, 'ageRange'),
            commonAgeRange: getMostCommon(sessions, 'ageRange'),
            
            // Goal analysis
            frequentGoals: extractCommonGoals(sessions),
            
            // Activity patterns
            warmupPatterns: extractActivityPatterns(sessions, 'warmup'),
            mainActivityPatterns: extractActivityPatterns(sessions, 'activity'),
            cooldownPatterns: extractActivityPatterns(sessions, 'cooldown'),
            
            // Reflection insights (if available)
            reflectionInsights: analyzeReflections(sessions),
            
            // Consistency score (based on regularity)
            consistencyScore: calculateConsistencyScore(sessions),
            
            // Recent trends
            recentTrends: analyzeRecentTrends(recentSessions)
        };

        return analysis;

    } catch (error) {
        console.error('Error analyzing session history:', error);
        throw error;
    }
}

/**
 * Get user's belt progress and profile information
 */
async function getUserContext(userId) {
    try {
        const user = await User.findById(userId).select('name role email').lean();
        if (!user) {
            throw new Error('User not found');
        }

        // Fetch belt progress
        let beltLevel = 'White';
        let beltProgress = null;
        
        try {
            beltProgress = await BeltProgress.findOne({ userId }).lean();
            if (beltProgress && beltProgress.currentBelt) {
                // Map belt codes to names
                const beltMap = {
                    'W': 'White',
                    'Y': 'Yellow',
                    'G': 'Green',
                    'BL': 'Blue',
                    'BR': 'Brown',
                    'B': 'Black'
                };
                beltLevel = beltMap[beltProgress.currentBelt] || 'White';
            }
        } catch (err) {
            console.log('No belt progress found, defaulting to White belt');
        }

        return {
            name: user.name,
            role: user.role,
            beltLevel,
            beltProgress
        };

    } catch (error) {
        console.error('Error fetching user context:', error);
        throw error;
    }
}

/**
 * Generate AI-powered recommendation using Groq
 */
async function generateAIRecommendation(sessionAnalysis, userContext) {
    const startTime = Date.now();
    
    try {
        const systemPrompt = buildRecommendationPrompt(sessionAnalysis, userContext);
        
        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: systemPrompt 
                },
                { 
                    role: "user", 
                    content: "Based on the analysis provided, generate a comprehensive session recommendation for today's training. Provide structured, actionable suggestions." 
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.9,
            stream: false,
        });

        const responseContent = completion.choices[0]?.message?.content || '';
        const generationTime = Date.now() - startTime;

        // Parse the AI response
        const parsedRecommendation = parseAIResponse(responseContent, sessionAnalysis, userContext);

        return {
            recommendation: parsedRecommendation,
            metadata: {
                model: completion.model,
                tokensUsed: completion.usage || {},
                generationTime,
                rawResponse: responseContent
            }
        };

    } catch (error) {
        console.error('Error generating AI recommendation:', error);
        
        // Fallback to rule-based recommendation
        return {
            recommendation: generateRuleBasedRecommendation(sessionAnalysis, userContext),
            metadata: {
                model: 'rule-based-fallback',
                tokensUsed: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                generationTime: Date.now() - startTime,
                error: error.message
            }
        };
    }
}

/**
 * Build the system prompt for AI recommendation
 */
function buildRecommendationPrompt(analysis, userContext) {
    const { hasHistory, totalSessions, preferredLevel, commonAgeRange, frequentGoals, 
            daysSinceLastSession, consistencyScore, recentTrends, reflectionInsights } = analysis;
    
    const { name, role, beltLevel } = userContext;

    return `You are an expert Taekwondo coach AI assistant for the "Mapped" training app.
You're helping ${name}, a ${role} with ${beltLevel} belt level, plan their next training session.

**COACH'S PROFILE:**
- Name: ${name}
- Role: ${role}
- Belt Level: ${beltLevel}
- Total Sessions Conducted: ${totalSessions}
- Days Since Last Session: ${daysSinceLastSession}
- Consistency Score: ${consistencyScore}/100

**SESSION HISTORY ANALYSIS:**
${hasHistory ? `
- Most Common Level: ${preferredLevel || 'Beginner'}
- Typical Age Range: ${commonAgeRange || 'Mixed ages'}
- Frequent Training Goals: ${frequentGoals.join(', ') || 'General skill development'}
- Recent Trends: ${JSON.stringify(recentTrends)}
${reflectionInsights ? `- Reflection Insights: ${JSON.stringify(reflectionInsights)}` : ''}
` : '- This is one of their first sessions - provide foundational guidance'}

**YOUR TASK:**
Generate a comprehensive, personalized session recommendation for TODAY's training session.

**REQUIRED OUTPUT STRUCTURE:**
Provide your recommendation in a structured format covering:

1. **SESSION BASICS:**
   - Recommended level (Beginner/Intermediate/Advanced)
   - Suggested duration (in minutes)
   - Ideal trainee count
   - Age range consideration

2. **PRIMARY GOALS:**
   - Main objective for today's session
   - 2-3 secondary goals
   - Clear reasoning based on their history

3. **WARM-UP (10-15 min):**
   - Detailed description
   - Key exercises (list 3-5)
   - Safety considerations

4. **MAIN ACTIVITY (30-40 min):**
   - Detailed session plan
   - Focus areas based on belt level
   - Specific drills and exercises
   - Progression tips
   - How this builds on previous sessions

5. **COOL-DOWN (10 min):**
   - Detailed description
   - Stretching routine
   - Reflection prompts

6. **RISK ASSESSMENT:**
   - Key safety risks for this session
   - Mitigation strategies

7. **REQUIRED RESOURCES:**
   - Essential equipment
   - Optional resources

8. **CONTINGENCIES:**
   - 2-3 backup plans if things don't go as expected
   - Weather alternatives (if outdoor)
   - Trainee count adjustments

9. **PERSONALIZED INSIGHTS:**
   - 2-3 strength areas based on their history
   - 2-3 areas for improvement
   - Motivational message
   - 3-5 specific tips for today

**GUIDELINES:**
- Be specific and actionable
- Tailor to their ${beltLevel} belt level and ${role} role
- Consider their session history and patterns
- Balance challenge with achievability
- Include proper Taekwondo terminology (European WTF style)
- Focus on safety and progression
- Make it motivating and supportive

Provide clear, structured guidance that ${name} can immediately implement.`;
}

/**
 * Parse AI response into structured recommendation
 */
function parseAIResponse(aiResponse, analysis, userContext) {
    // This is a sophisticated parser that extracts structured data from the AI's text response
    // For now, we'll provide a structured template that gets populated
    
    const recommendation = {
        suggestedLevel: analysis.preferredLevel || 'Beginner',
        suggestedDuration: analysis.averageSessionDuration || 60,
        recommendedVenue: analysis.commonVenues?.[0] || '',
        suggestedAgeRange: analysis.commonAgeRange || '',
        suggestedTraineeCount: analysis.typicalTraineeCount || 8,
        
        goals: {
            primary: extractSection(aiResponse, 'primary', 'main objective') || 
                     'Develop fundamental Taekwondo techniques',
            secondary: extractList(aiResponse, 'secondary goals') || 
                      ['Improve physical conditioning', 'Build discipline and focus'],
            reasoning: extractSection(aiResponse, 'reasoning', 'based on') || 
                      'Based on consistent training patterns and progression path'
        },
        
        warmup: {
            description: extractSection(aiResponse, 'warm-up', 'warm up') || 
                        'Dynamic stretching and cardiovascular preparation',
            suggestedTime: 10,
            keyExercises: extractList(aiResponse, 'warm-up', 'warm up') || 
                         ['Light jogging', 'Arm circles', 'Leg swings', 'Hip rotations']
        },
        
        activity: {
            description: extractSection(aiResponse, 'main activity', 'activity') || 
                        'Focused technique training with progressive drills',
            suggestedTime: analysis.averageSessionDuration - 20 || 40,
            focusAreas: extractList(aiResponse, 'focus area') || 
                       ['Basic stances', 'Front kick technique', 'Blocking fundamentals'],
            drills: extractList(aiResponse, 'drill', 'exercise') || 
                   ['Mirror drills', 'Target practice', 'Partner combinations'],
            progressionTips: extractList(aiResponse, 'progression', 'tip') || 
                            ['Start slow, focus on form', 'Gradually increase speed', 'Add complexity only when basics are solid']
        },
        
        cooldown: {
            description: extractSection(aiResponse, 'cool-down', 'cool down') || 
                        'Static stretching and recovery',
            suggestedTime: 10,
            keyExercises: extractList(aiResponse, 'cool-down', 'cool down') || 
                         ['Hamstring stretch', 'Quad stretch', 'Shoulder stretch', 'Breathing exercises']
        },
        
        contingencies: {
            description: extractSection(aiResponse, 'contingenc', 'backup') || 
                        'Flexible alternatives for various scenarios',
            scenarios: extractContingencyScenarios(aiResponse) || [
                { situation: 'Low attendance', solution: 'Focus on individual technique refinement' },
                { situation: 'Equipment unavailable', solution: 'Adapt to bodyweight exercises and partner drills' }
            ]
        },
        
        riskAssessment: {
            description: 'Standard Taekwondo training safety protocols',
            keyRisks: extractList(aiResponse, 'risk', 'safety') || 
                     ['Muscle strains from insufficient warm-up', 'Impact injuries during sparring', 'Fatigue-related accidents'],
            mitigationStrategies: extractList(aiResponse, 'mitigation', 'prevention') || 
                                 ['Thorough warm-up routine', 'Proper protective equipment', 'Clear safety briefing', 'Adequate rest periods']
        },
        
        resources: {
            description: 'Essential training equipment',
            required: extractList(aiResponse, 'required', 'essential') || 
                     ['Training mats', 'First aid kit'],
            optional: extractList(aiResponse, 'optional') || 
                     ['Kicking shields', 'Focus mitts', 'Resistance bands']
        }
    };
    
    return recommendation;
}

/**
 * Generate insights from the analysis
 */
function generateInsights(analysis, userContext, aiResponse) {
    return {
        strengthAreas: extractList(aiResponse, 'strength') || 
                      analysis.reflectionInsights?.commonStrengths || 
                      ['Consistent training schedule', 'Progressive goal setting'],
        
        improvementAreas: extractList(aiResponse, 'improvement', 'area for growth') || 
                         analysis.reflectionInsights?.commonImprovements || 
                         ['Session variety', 'Advanced technique integration'],
        
        motivationalMessage: extractSection(aiResponse, 'motivat', 'encourag') || 
                           `Great progress, ${userContext.name}! Your consistency shows dedication. Keep building on your ${userContext.beltLevel} belt skills.`,
        
        progressionPath: extractSection(aiResponse, 'progression path', 'next steps') || 
                        `Continue developing ${userContext.beltLevel} belt techniques while preparing for advancement.`,
        
        tipsForToday: extractList(aiResponse, 'tip', 'today') || [
            'Focus on proper form over speed',
            'Encourage questions and engagement',
            'Celebrate small improvements',
            'Maintain positive energy throughout'
        ]
    };
}

/**
 * Fallback rule-based recommendation
 */
function generateRuleBasedRecommendation(analysis, userContext) {
    const { beltLevel } = userContext;
    const level = analysis.preferredLevel || 'Beginner';
    
    return {
        suggestedLevel: level,
        suggestedDuration: analysis.averageSessionDuration || 60,
        recommendedVenue: analysis.commonVenues?.[0] || 'Main Training Hall',
        suggestedAgeRange: analysis.commonAgeRange || '8-12 years',
        suggestedTraineeCount: analysis.typicalTraineeCount || 8,
        
        goals: {
            primary: `Develop ${level.toLowerCase()} ${beltLevel} belt techniques`,
            secondary: ['Improve physical fitness', 'Build confidence', 'Practice discipline'],
            reasoning: 'Based on your consistent training pattern and current belt level'
        },
        
        warmup: {
            description: 'Dynamic warm-up to prepare for training',
            suggestedTime: 10,
            keyExercises: ['Light jogging', 'Arm circles', 'Leg swings', 'Dynamic stretching', 'Basic stances']
        },
        
        activity: {
            description: 'Focused technique practice with progressive difficulty',
            suggestedTime: 40,
            focusAreas: getBeltSpecificFocusAreas(beltLevel),
            drills: getBeltSpecificDrills(beltLevel),
            progressionTips: [
                'Start with slow, controlled movements',
                'Focus on proper form before adding speed',
                'Provide individual corrections',
                'Gradually increase intensity'
            ]
        },
        
        cooldown: {
            description: 'Static stretching and recovery',
            suggestedTime: 10,
            keyExercises: ['Hamstring stretch', 'Quad stretch', 'Calf stretch', 'Shoulder stretch', 'Deep breathing']
        },
        
        contingencies: {
            description: 'Backup plans for common scenarios',
            scenarios: [
                { situation: 'Low trainee attendance', solution: 'Individual technique refinement and one-on-one corrections' },
                { situation: 'Equipment shortage', solution: 'Partner drills and bodyweight exercises' },
                { situation: 'Weather issues (outdoor)', solution: 'Move to covered area or adjust to space-efficient drills' }
            ]
        },
        
        riskAssessment: {
            description: 'Standard safety protocols for Taekwondo training',
            keyRisks: ['Muscle strains', 'Impact injuries', 'Overexertion'],
            mitigationStrategies: [
                'Mandatory warm-up completion',
                'Proper protective equipment',
                'Clear safety rules briefing',
                'Adequate rest between drills',
                'First aid kit readily available'
            ]
        },
        
        resources: {
            description: 'Training equipment needed',
            required: ['Training mats', 'First aid kit', 'Water station'],
            optional: ['Kicking shields', 'Focus mitts', 'Belts for marking zones', 'Cones']
        }
    };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateAverage(sessions, field) {
    const values = sessions.map(s => {
        const val = s[field];
        if (field === 'duration') {
            // Handle duration that might be a string like "60 min" or a number
            return typeof val === 'string' ? parseInt(val) : val;
        }
        return val;
    }).filter(v => v && !isNaN(v));
    
    return values.length > 0 
        ? values.reduce((sum, v) => sum + v, 0) / values.length 
        : 0;
}

function calculateDistribution(sessions, field) {
    const dist = {};
    sessions.forEach(s => {
        const value = s[field];
        if (value) {
            dist[value] = (dist[value] || 0) + 1;
        }
    });
    return dist;
}

function getMostCommon(sessions, field) {
    const dist = calculateDistribution(sessions, field);
    let maxCount = 0;
    let mostCommon = null;
    
    for (const [value, count] of Object.entries(dist)) {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = value;
        }
    }
    
    return mostCommon;
}

function getTopN(sessions, field, n = 3) {
    const dist = calculateDistribution(sessions, field);
    return Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([value]) => value);
}

function extractCommonGoals(sessions) {
    const allGoals = sessions
        .map(s => s.goals)
        .filter(g => g && g.trim().length > 0);
    
    // Simple extraction of common themes
    const themes = new Set();
    const keywords = ['kick', 'form', 'poomsae', 'spar', 'technique', 'stance', 'belt', 'discipline', 'fitness', 'defense'];
    
    allGoals.forEach(goal => {
        const lowerGoal = goal.toLowerCase();
        keywords.forEach(keyword => {
            if (lowerGoal.includes(keyword)) {
                themes.add(keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' development');
            }
        });
    });
    
    return Array.from(themes).slice(0, 5);
}

function extractActivityPatterns(sessions, activityType) {
    const patterns = sessions
        .map(s => s[activityType]?.desc)
        .filter(desc => desc && desc.trim().length > 0)
        .slice(0, 3);
    
    return patterns.length > 0 ? patterns : [`No ${activityType} data`];
}

function analyzeReflections(sessions) {
    const reflections = sessions
        .filter(s => s.reflection && (
            s.reflection.highlights || 
            s.reflection.improvements || 
            s.reflection.rating > 0
        ));
    
    if (reflections.length === 0) return null;
    
    const avgRating = reflections
        .filter(r => r.reflection.rating > 0)
        .reduce((sum, r) => sum + r.reflection.rating, 0) / 
        Math.max(reflections.filter(r => r.reflection.rating > 0).length, 1);
    
    return {
        totalReflections: reflections.length,
        averageRating: avgRating.toFixed(1),
        commonStrengths: extractReflectionThemes(reflections, 'highlights'),
        commonImprovements: extractReflectionThemes(reflections, 'improvements')
    };
}

function extractReflectionThemes(reflections, field) {
    const themes = reflections
        .map(r => r.reflection[field])
        .filter(t => t && t.trim().length > 0);
    
    return themes.length > 0 ? themes.slice(0, 3) : [];
}

function calculateConsistencyScore(sessions) {
    if (sessions.length < 2) return 50;
    
    // Calculate based on regularity of sessions
    const dates = sessions.map(s => new Date(s.date)).sort((a, b) => a - b);
    const intervals = [];
    
    for (let i = 1; i < dates.length; i++) {
        const days = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
        intervals.push(days);
    }
    
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower standard deviation = higher consistency
    // Normalize to 0-100 scale (assuming weekly sessions as ideal)
    const consistencyScore = Math.max(0, Math.min(100, 100 - (stdDev * 5)));
    
    return Math.round(consistencyScore);
}

function analyzeRecentTrends(recentSessions) {
    if (recentSessions.length < 2) return 'Insufficient data for trend analysis';
    
    const trends = [];
    
    // Check if duration is increasing/decreasing
    const durations = recentSessions.map(s => 
        typeof s.duration === 'string' ? parseInt(s.duration) : s.duration
    ).filter(d => d && !isNaN(d));
    
    if (durations.length >= 2) {
        const recentAvg = durations.slice(0, 2).reduce((a, b) => a + b) / 2;
        const olderAvg = durations.slice(-2).reduce((a, b) => a + b) / 2;
        
        if (recentAvg > olderAvg + 5) trends.push('Increasing session duration');
        else if (recentAvg < olderAvg - 5) trends.push('Decreasing session duration');
    }
    
    // Check trainee count trends
    const traineeCounts = recentSessions.map(s => s.totalTrainees).filter(t => t);
    if (traineeCounts.length >= 2) {
        const recentAvg = traineeCounts.slice(0, 2).reduce((a, b) => a + b) / 2;
        const olderAvg = traineeCounts.slice(-2).reduce((a, b) => a + b) / 2;
        
        if (recentAvg > olderAvg + 2) trends.push('Growing class sizes');
        else if (recentAvg < olderAvg - 2) trends.push('Smaller class sizes');
    }
    
    return trends.length > 0 ? trends.join('; ') : 'Stable training pattern';
}

function extractSection(text, ...keywords) {
    if (!text) return '';
    
    const lines = text.split('\n');
    let capturing = false;
    let content = [];
    
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        
        // Check if this line contains any of the keywords
        if (keywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
            capturing = true;
            continue;
        }
        
        // If we're capturing and hit a new section header, stop
        if (capturing && line.match(/^\d+\.|^[A-Z ]+:|\*\*/)) {
            if (content.length > 0) break;
        }
        
        // Capture content
        if (capturing && line.trim().length > 0) {
            content.push(line.trim().replace(/^[-*•]\s*/, ''));
        }
    }
    
    return content.join(' ').slice(0, 500);
}

function extractList(text, ...keywords) {
    if (!text) return [];
    
    const lines = text.split('\n');
    let capturing = false;
    let items = [];
    
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        
        // Check if this line contains any of the keywords
        if (keywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
            capturing = true;
            continue;
        }
        
        // If we're capturing and hit a new section header, stop
        if (capturing && line.match(/^\d+\.|^[A-Z ]+:/)) {
            if (items.length > 0) break;
        }
        
        // Capture list items
        if (capturing && line.trim().length > 0) {
            const cleaned = line.trim().replace(/^[-*•\d.)\]]\s*/, '');
            if (cleaned.length > 3) {
                items.push(cleaned);
            }
        }
    }
    
    return items.slice(0, 10);
}

function extractContingencyScenarios(text) {
    const scenarios = [];
    const lines = text.split('\n');
    let inContingency = false;
    
    for (const line of lines) {
        if (line.toLowerCase().includes('contingenc') || line.toLowerCase().includes('backup')) {
            inContingency = true;
            continue;
        }
        
        if (inContingency && line.trim().length > 0) {
            if (line.match(/^\d+\.|^[A-Z ]+:/)) {
                if (scenarios.length > 0) break;
            }
            
            // Try to extract situation-solution pairs
            const cleaned = line.trim().replace(/^[-*•\d.)\]]\s*/, '');
            if (cleaned.includes(':')) {
                const [situation, solution] = cleaned.split(':').map(s => s.trim());
                scenarios.push({ situation, solution });
            } else if (cleaned.length > 5) {
                scenarios.push({ 
                    situation: cleaned, 
                    solution: 'Adapt session plan as needed' 
                });
            }
        }
    }
    
    return scenarios.slice(0, 3);
}

function getBeltSpecificFocusAreas(beltLevel) {
    const focusAreas = {
        'White': ['Basic stances', 'Front kick', 'Low block', 'Taegeuk Il Jang'],
        'Yellow': ['Roundhouse kick', 'Middle block', 'Knife-hand strike', 'Taegeuk Ee Jang'],
        'Green': ['Side kick', 'Back kick', 'High block', 'Taegeuk Sam Jang'],
        'Blue': ['Axe kick', 'Spinning techniques', 'Advanced blocks', 'Taegeuk Sa Jang'],
        'Brown': ['Jump kicks', 'Combination techniques', 'Sparring strategies', 'Taegeuk Oh Jang'],
        'Black': ['Advanced combinations', 'Teaching techniques', 'Competition preparation', 'Koryo form']
    };
    
    return focusAreas[beltLevel] || focusAreas['White'];
}

function getBeltSpecificDrills(beltLevel) {
    const drills = {
        'White': ['Mirror drills for stances', 'Slow-motion front kicks', 'Block and counter basics', 'Form repetition'],
        'Yellow': ['Roundhouse kick on pads', 'Combination blocks', 'Partner kicking drills', 'Speed drills'],
        'Green': ['Side kick on shields', 'Back kick technique', 'Sparring footwork', 'Power combinations'],
        'Blue': ['Axe kick practice', 'Spinning back kick', 'Advanced sparring', 'Jump front kick'],
        'Brown': ['Multiple kick combinations', 'Jump roundhouse', 'Competition drills', 'Board breaking practice'],
        'Black': ['Teaching practice', 'Advanced sparring strategies', 'Demonstration techniques', 'Form perfection']
    };
    
    return drills[beltLevel] || drills['White'];
}

// ============================================
// ROUTER MODULE
// ============================================

module.exports = (asyncHandler) => {
    const router = express.Router();

    /**
     * GET /api/recommendations/generate/:userId
     * Generate a new AI-powered session recommendation
     */
    router.get('/generate/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { forceNew } = req.query;

        console.log(`📊 Generating recommendation for user: ${userId}`);

        // Validate userId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid userId format' 
            });
        }

        // Check for existing active recommendation (unless forceNew is true)
        if (!forceNew) {
            const existingRecommendation = await SessionRecommendation.getLatestForUser(userId);
            if (existingRecommendation) {
                console.log('✅ Returning existing active recommendation');
                return res.json({
                    success: true,
                    data: existingRecommendation,
                    cached: true,
                    message: 'Using existing recommendation from today'
                });
            }
        }

        // Validate API key
        if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy_key_if_not_set') {
            console.error('❌ GROQ_API_KEY is missing');
            return res.status(500).json({ 
                success: false,
                error: 'AI service is currently unavailable' 
            });
        }

        try {
            // Step 1: Get user context
            console.log('👤 Fetching user context...');
            const userContext = await getUserContext(userId);

            // Step 2: Analyze session history
            console.log('📈 Analyzing session history...');
            const sessionAnalysis = await analyzeSessionHistory(userId);

            // Step 3: Generate AI recommendation
            console.log('🤖 Generating AI recommendation...');
            const { recommendation, metadata } = await generateAIRecommendation(
                sessionAnalysis, 
                userContext
            );

            // Step 4: Generate insights
            console.log('💡 Generating insights...');
            const insights = generateInsights(
                sessionAnalysis, 
                userContext, 
                metadata.rawResponse
            );

            // Step 5: Create and save recommendation
            const newRecommendation = new SessionRecommendation({
                userId,
                analysisContext: {
                    totalSessionsAnalyzed: sessionAnalysis.totalSessions,
                    recentSessionsCount: sessionAnalysis.recentSessionsCount,
                    userBeltLevel: userContext.beltLevel,
                    userRole: userContext.role,
                    lastSessionDate: sessionAnalysis.lastSessionDate,
                    daysSinceLastSession: sessionAnalysis.daysSinceLastSession,
                    averageSessionDuration: sessionAnalysis.averageSessionDuration,
                    commonVenues: sessionAnalysis.commonVenues,
                    typicalTraineeCount: sessionAnalysis.typicalTraineeCount
                },
                patterns: {
                    preferredLevel: sessionAnalysis.preferredLevel,
                    commonAgeRange: sessionAnalysis.commonAgeRange,
                    frequentGoals: sessionAnalysis.frequentGoals,
                    consistencyScore: sessionAnalysis.consistencyScore
                },
                recommendation,
                insights,
                aiMetadata: {
                    model: metadata.model,
                    tokensUsed: metadata.tokensUsed,
                    generationTime: metadata.generationTime,
                    cached: false
                }
            });

            await newRecommendation.save();
            console.log('✅ Recommendation saved successfully');

            res.json({
                success: true,
                data: newRecommendation,
                cached: false,
                message: 'New recommendation generated successfully'
            });

        } catch (error) {
            console.error('❌ Error generating recommendation:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate recommendation',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }));

    /**
     * GET /api/recommendations/latest/:userId
     * Get the latest active recommendation for a user
     */
    router.get('/latest/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid userId format' 
            });
        }

        const recommendation = await SessionRecommendation.getLatestForUser(userId);

        if (!recommendation) {
            return res.status(404).json({
                success: false,
                message: 'No active recommendation found. Generate a new one!'
            });
        }

        res.json({
            success: true,
            data: recommendation
        });
    }));

    /**
     * GET /api/recommendations/history/:userId
     * Get recommendation history for a user
     */
    router.get('/history/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { limit } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid userId format' 
            });
        }

        const history = await SessionRecommendation.getUserRecommendationHistory(
            userId, 
            parseInt(limit) || 10
        );

        res.json({
            success: true,
            data: history,
            count: history.length
        });
    }));

    /**
     * POST /api/recommendations/feedback/:recommendationId
     * Submit feedback for a recommendation
     */
    router.post('/feedback/:recommendationId', asyncHandler(async (req, res) => {
        const { recommendationId } = req.params;
        const { wasUseful, rating, comments, wasImplemented } = req.body;

        if (!mongoose.Types.ObjectId.isValid(recommendationId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid recommendation ID' 
            });
        }

        const recommendation = await SessionRecommendation.findById(recommendationId);
        if (!recommendation) {
            return res.status(404).json({
                success: false,
                error: 'Recommendation not found'
            });
        }

        await recommendation.submitFeedback({
            wasUseful,
            rating,
            comments,
            wasImplemented
        });

        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            data: recommendation
        });
    }));

    /**
     * PUT /api/recommendations/implement/:recommendationId
     * Mark a recommendation as implemented
     */
    router.put('/implement/:recommendationId', asyncHandler(async (req, res) => {
        const { recommendationId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(recommendationId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid recommendation ID' 
            });
        }

        const recommendation = await SessionRecommendation.findById(recommendationId);
        if (!recommendation) {
            return res.status(404).json({
                success: false,
                error: 'Recommendation not found'
            });
        }

        await recommendation.markAsImplemented();

        res.json({
            success: true,
            message: 'Recommendation marked as implemented',
            data: recommendation
        });
    }));

    /**
     * DELETE /api/recommendations/:recommendationId
     * Dismiss/delete a recommendation
     */
    router.delete('/:recommendationId', asyncHandler(async (req, res) => {
        const { recommendationId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(recommendationId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid recommendation ID' 
            });
        }

        const recommendation = await SessionRecommendation.findById(recommendationId);
        if (!recommendation) {
            return res.status(404).json({
                success: false,
                error: 'Recommendation not found'
            });
        }

        recommendation.status = 'dismissed';
        await recommendation.save();

        res.json({
            success: true,
            message: 'Recommendation dismissed'
        });
    }));

    /**
     * GET /api/recommendations/analytics/:userId
     * Get analytics about user's recommendation usage
     */
    router.get('/analytics/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid userId format' 
            });
        }

        const recommendations = await SessionRecommendation.find({ userId });

        const analytics = {
            totalRecommendations: recommendations.length,
            implementedCount: recommendations.filter(r => r.status === 'implemented').length,
            averageRating: recommendations
                .filter(r => r.userFeedback.rating)
                .reduce((sum, r) => sum + r.userFeedback.rating, 0) / 
                Math.max(recommendations.filter(r => r.userFeedback.rating).length, 1),
            usefulCount: recommendations.filter(r => r.userFeedback.wasUseful === true).length,
            mostCommonLevel: getMostCommon(recommendations.map(r => ({ 
                level: r.recommendation.suggestedLevel 
            })), 'level'),
            averageGenerationTime: recommendations.reduce((sum, r) => 
                sum + (r.aiMetadata.generationTime || 0), 0) / recommendations.length,
            totalTokensUsed: recommendations.reduce((sum, r) => 
                sum + (r.aiMetadata.tokensUsed.total_tokens || 0), 0)
        };

        res.json({
            success: true,
            data: analytics
        });
    }));

    /**
     * GET /api/recommendations/health
     * Health check for recommendation service
     */
    router.get('/health', asyncHandler(async (req, res) => {
        const isApiConfigured = process.env.GROQ_API_KEY && 
                               process.env.GROQ_API_KEY !== 'dummy_key_if_not_set';
        const isDbConnected = mongoose.connection.readyState === 1;

        res.json({
            status: isApiConfigured && isDbConnected ? 'healthy' : 'degraded',
            ai: isApiConfigured ? 'configured' : 'not_configured',
            database: isDbConnected ? 'connected' : 'disconnected',
            service: 'session-recommendations'
        });
    }));

    return router;
};