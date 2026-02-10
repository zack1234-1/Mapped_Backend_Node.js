const express = require('express');
const Session = require('../models/session');
const BeltProgress = require('../models/beltProgress');
const parseFlutterDate = (dateString) => {
    try {
        if (!dateString) return null;
        if (dateString.includes('/')) {
            const [day, month, year] = dateString.split('/');
            return new Date(Date.UTC(year, month - 1, day));
        }
        return new Date(dateString);
    } catch (e) {
        console.error("Date Parsing Error", e);
        return null;
    }
};

module.exports = (asyncHandler) => {
    const router = express.Router();

  //1.CREATE SESSION
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('📥 Received request body:', req.body);

        const {
            trainerId, trainer, date, venue, totalTrainees,
            level, duration, sessionNo, ageRange,
            riskAssessment, resources, othersInvolved,
            goals, warmup, activity, cooldown, contingencies, reflection
        } = req.body;

        if (!trainerId || !trainer || !date || !venue || !totalTrainees || !goals || !duration) {
            return res.status(400).json({
                success: false,
                msg: 'Required fields missing (Trainer, Date, Venue, Pax, Duration, Goals)'
            });
        }

        try {
            const parsedDate = parseFlutterDate(date);
            if (!parsedDate || isNaN(parsedDate)) {
                 return res.status(400).json({ success: false, msg: 'Invalid Date Format' });
            }

            const session = new Session({
                trainerId, trainer, venue,
                date: parsedDate,
                totalTrainees: parseInt(totalTrainees),
                duration, 
                level, sessionNo, ageRange,
                riskAssessment, resources, othersInvolved,
                goals, warmup, activity, cooldown, contingencies, reflection
            });

            await session.save();
            
            return res.status(201).json({ 
                success: true, 
                msg: 'Session created successfully',
                data: session
            });
            
        } catch (err) {
            console.error('💥 ERROR:', err);
            if (err.name === 'ValidationError') {
                return res.status(400).json({ success: false, msg: 'Validation Error', errors: Object.values(err.errors).map(e => e.message) });
            }
            next(err);
        }
    }));

    router.get('/dashboard', asyncHandler(async (req, res) => {
        const { trainerId, trainer } = req.query;
        if (!trainerId && !trainer) return res.status(400).json({ success: false, msg: "Trainer info missing" });
        
        try {
            const query = trainerId ? { trainerId: trainerId } : { trainer: trainer };
            const sessions = await Session.find(query).lean();
            const now = new Date();
            const todayStr = new Date(now.getTime() + (8 * 60 * 60 * 1000)).toISOString().split('T')[0];

            let current = []; 
            let upcoming = [];
            let history = [];
            
            sessions.forEach(session => {
                if (!session.date) return;

                if (!session.duration) {
        session.duration = "0 min"; 
    }
                
                const sessionDate = new Date(session.date);
                const sessStr = sessionDate.toISOString().split('T')[0];
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                session.uiDate = `${days[sessionDate.getUTCDay()]}, ${months[sessionDate.getUTCMonth()]} ${sessionDate.getUTCDate()}, ${sessionDate.getUTCFullYear()}`;
                
                if (sessStr === todayStr) {
                    current.push(session);
                } else if (sessStr > todayStr) {
                    upcoming.push(session); 
                } else {
                    history.push(session); 
                }
            });

            current.sort((a, b) => new Date(a.date) - new Date(b.date));
            upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
            history.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            res.json({
                success: true,
                data: {
                    current, upcoming, history,    
                    totalSessionsCount: sessions.length
                }
            });
        } catch (err) {
            console.error("Dashboard Error:", err);
            res.status(500).json({ success: false, msg: "Server Error" });
        }
    }));


    // 3. Update session
    router.put('/:id', asyncHandler(async (req, res, next) => {
        const { 
            trainer, date, venue, totalTrainees, duration, 
            level, sessionNo, ageRange,
            riskAssessment, resources, othersInvolved,
            goals, warmup, activity, cooldown, contingencies,
            reflection
        } = req.body;

        if (!trainer || !date) return res.status(400).json({ success: false, msg: 'Trainer and Date required' });

        try {
            const parsedDate = parseFlutterDate(date);
            let session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ success: false, msg: 'Session not found' });


            session.trainer = trainer;
            session.date = parsedDate;
            session.venue = venue;
            session.totalTrainees = parseInt(totalTrainees);

            if (duration) session.duration = duration;
            if (level) session.level = level;
            if (sessionNo) session.sessionNo = sessionNo;
            if (ageRange) session.ageRange = ageRange;
            if (riskAssessment !== undefined) session.riskAssessment = riskAssessment;
            if (resources !== undefined) session.resources = resources;
            if (othersInvolved !== undefined) session.othersInvolved = othersInvolved;
            if (goals) session.goals = goals;
            if (contingencies !== undefined) session.contingencies = contingencies;
            if (warmup) session.warmup = warmup;
            if (activity) session.activity = activity;
            if (cooldown) session.cooldown = cooldown;
            if (reflection !== undefined) {

                const hadReflection = session.reflection && (
                    (session.reflection.rating && session.reflection.rating > 0) ||
                    (session.reflection.highlights && session.reflection.highlights.trim().length > 0) ||
                    (session.reflection.improvements && session.reflection.improvements.trim().length > 0) ||
                    (session.reflection.actionItems && session.reflection.actionItems.length > 0)
                );
                
                session.reflection = reflection;

                const hasNewReflection = reflection && (
                    (reflection.rating && reflection.rating > 0) ||
                    (reflection.highlights && reflection.highlights.trim().length > 0) ||
                    (reflection.improvements && reflection.improvements.trim().length > 0) ||
                    (reflection.actionItems && reflection.actionItems.length > 0)
                );
                
                if (!hadReflection && hasNewReflection && session.trainerId) {
                    try {
                        const beltProgress = await BeltProgress.findOne({ userId: session.trainerId });
                        const greenBelt = beltProgress?.belts?.G;
                        const currentCount = greenBelt?.writeShortDescriptionCount || 0;
                        const maxReq = 1; 
                        
                        if (currentCount < maxReq) {
                            await BeltProgress.updateOne(
                                { userId: session.trainerId },
                                { $inc: { 'belts.G.writeShortDescriptionCount': 1 } },
                                { upsert: true }
                            );
                            console.log(`✅ Reflection recorded for Green Belt: ${session.trainerId}`);
                        }
                    } catch (err) {
                        console.error('Error updating reflection count:', err);
                    }
                }
            }

            await session.save();
            res.status(200).json({ success: true, msg: 'Updated', data: session });

        } catch (err) {
            next(err);
        }
    }));

    return router;
};