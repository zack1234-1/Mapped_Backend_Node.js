const express = require('express');
const Session = require('../models/session');

// Helper: Parse Flutter Date String "dd/mm/yyyy"
const parseFlutterDate = (dateString) => {
    try {
        if (!dateString) return null;
        if (dateString.includes('/')) {
            const [day, month, year] = dateString.split('/');
            // Create UTC date to ensure day stability
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

    // ==========================================
    // 1. POST /api/session - Create new session
    // ==========================================
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
                duration, // Saved purely as string (e.g. "60 min")
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

                // --- FORMAT DATE FOR UI ---
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

    // ==========================================
    // 3. PUT /api/session/:id - Update session
    // ==========================================
    router.put('/:id', asyncHandler(async (req, res, next) => {
        const { 
            trainer, date, venue, totalTrainees, duration, // Core fields
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

            // Update Fields
            session.trainer = trainer;
            session.date = parsedDate;
            session.venue = venue;
            session.totalTrainees = parseInt(totalTrainees);
            if (duration) session.duration = duration;

            // Optional Updates
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
            if (reflection) session.reflection = reflection;

            await session.save();
            res.status(200).json({ success: true, msg: 'Updated', data: session });

        } catch (err) {
            next(err);
        }
    }));

    return router;
};