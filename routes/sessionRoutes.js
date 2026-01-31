const express = require('express');
const Session = require('../models/session');

// --- HELPER FUNCTIONS ---

// 1. Force a Date object to visually match Malaysia Time (UTC+8)
// If incoming is 10:00 UTC (18:00 MYT), this shifts it to 18:00 UTC.
const forceMalaysiaTime = (isoStringOrDate) => {
    if (!isoStringOrDate) return null;
    const date = new Date(isoStringOrDate);
    // Add 8 Hours manually
    date.setHours(date.getHours() + 8); 
    return date;
};

// 1. Parse Flutter Date String "Wed, Sept 21, 2025" to JS Date Object (For Creating)
const parseFlutterDate = (dateString) => {
    try {
        if (!dateString) return null;
        // Remove the Weekday (Get "Sept 21, 2025")
        let cleanDate = dateString.split(', ').slice(1).join(', '); 
        // Fix "Sept" to "Sep" because JS Date object prefers "Sep"
        cleanDate = cleanDate.replace('Sept', 'Sep');
        
        // ✅ FIX: Append 'UTC' to force the date to stay fixed, 
        // preventing it from shifting back to the previous day.
        return new Date(cleanDate + ' UTC'); 
    } catch (e) {
        console.error("Date Parsing Error", e);
        return null;
    }
};

// 2. Format Date back to YYYY-MM-DD (Optional helper)
const formatDateResponse = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 3. Parse time string "6:00 PM - 7:00 PM" + Date to get Start/End Objects (For Dashboard Logic)
const getSessionTimeRange = (sessionDate, timeString) => {
    try {
        // timeString format: "6:00 PM - 7:00 PM"
        const [startPart, endPart] = timeString.split('-').map(t => t.trim());
        
        const parseTime = (dateBase, timeStr) => {
            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':');
            
            hours = parseInt(hours);
            minutes = parseInt(minutes);

            if (hours === 12) {
                hours = modifier === 'PM' ? 12 : 0;
            } else if (modifier === 'PM') {
                hours += 12;
            }

            const newDate = new Date(dateBase);
            newDate.setHours(hours, minutes, 0, 0);
            return newDate;
        };

        const startDate = parseTime(sessionDate, startPart);
        const endDate = parseTime(sessionDate, endPart);

        return { start: startDate, end: endDate };
    } catch (e) {
        return null; 
    }
};


module.exports = (asyncHandler) => {
    const router = express.Router();

    // ==========================================
    // 1. POST /api/session - Create new session
    // ==========================================
    router.post('/', asyncHandler(async (req, res, next) => {
        console.log('=== SESSION CREATE REQUEST START ===');
        console.log('📥 Received request body:', req.body);

        const {
            trainerId,
            trainer,
            date, // Comes in as "Wed, Sept 21, 2025"
            startTime,  // Flutter now sends ISO String
            endTime,    // Flutter now sends ISO String
            venue,
            totalTrainees
        } = req.body;

        // Validation
        if (!trainerId || !trainer || !date ||!startTime || !endTime|| !venue || !totalTrainees) {
            return res.status(400).json({
                success: false,
                msg: 'All fields are required'
            });
        }

        try {
            // Parse the custom Flutter date string
            const parsedDate = parseFlutterDate(date);
            
            if (!parsedDate || isNaN(parsedDate)) {
                 return res.status(400).json({
                    success: false,
                    msg: 'Invalid Date Format'
                });
            }

            // 2. Handle Start/End Time
            // We apply the +8 Hour shift here so MongoDB saves "18:16" instead of "10:16"
            const mytStartTime = forceMalaysiaTime(startTime);
            const mytEndTime = forceMalaysiaTime(endTime);

            // Create new session
            const session = new Session({
                trainerId,
                trainer,
                date: parsedDate, 
                startTime: mytStartTime, 
                endTime: mytEndTime,
                venue,
                totalTrainees: parseInt(totalTrainees)
            });

            await session.save();
            
            console.log('✅ Session saved successfully with ID:', session._id);
            
            return res.status(201).json({ 
                success: true, 
                msg: 'Session created successfully',
                data: session
                // data: {
                //     id: session._id,
                //     trainer: session.trainer,
                //     date: formatDateResponse(session.date),
                //     time: session.time,
                //     venue: session.venue,
                //     totalTrainees: session.totalTrainees
                // }
            });
            
        } catch (err) {
            console.error('💥 ERROR in session creation:', err);
            if (err.name === 'ValidationError') {
                const errors = Object.values(err.errors).map(e => e.message);
                return res.status(400).json({ success: false, msg: 'Validation Error', errors: errors });
            }
            next(err);
        }
    }));

    // ==================================================
    // 2. GET /api/session/dashboard - Get categorized data
    // ==================================================
    router.get('/dashboard', asyncHandler(async (req, res) => {
        console.log('📥 GET Dashboard Data');
        const { trainerId, trainer } = req.query;
        if (!trainerId && !trainer) {
        return res.status(400).json({ success: false, msg: "Trainer info missing" });
    }

        
        try {
            const query = trainerId ? { trainerId: trainerId } : { trainer: trainer };
        
        // 4. ADDED: Fetch sessions from MongoDB based on the trainer
            const sessions = await Session.find(query).lean();
            const now = new Date();
            now.setHours(now.getHours() + 8); // Shift server time to match DB time

            let current = []; 
            let upcoming = [];
            let history = [];
            
            sessions.forEach(session => {
                try {
                    if (!session.startTime || !session.endTime) {
                        return; 
                    }

                    const start = new Date(session.startTime);
                    const end = new Date(session.endTime);
                
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                        console.log(`⚠️ Invalid Date found for session ${session._id}`)
                        return; 
                    }

                    let dateObj = session.date ? new Date(session.date) : start;

                    if (isNaN(dateObj.getTime())) {
                        dateObj = start;
                    }

                    // --- FORMAT DATE FOR UI ---
                    const formatTime = (d) => {
                        // We use getUTCHours because we stored "18:00" in the UTC slot
                        let hours = d.getUTCHours(); 
                        const minutes = String(d.getUTCMinutes()).padStart(2, '0');
                        const ampm = hours >= 12 ? 'PM' : 'AM';
                        hours = hours % 12;
                        hours = hours ? hours : 12; 
                        return `${hours}:${minutes} ${ampm}`;
                    };
                    
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                
                    
                    let dObj = session.date ? new Date(session.date) : start;
                    if (isNaN(dObj.getTime())) dObj = start;
                    
                    session.uiDate = `${days[dObj.getUTCDay()]}, ${months[dObj.getUTCMonth()]} ${dObj.getUTCDate()}, ${dObj.getUTCFullYear()}`;
                    session.time = `${formatTime(start)} - ${formatTime(end)}`;


                    const isSameDay = 
                        start.getUTCFullYear() === now.getUTCFullYear() &&
                        start.getUTCMonth() === now.getUTCMonth() &&
                        start.getUTCDate() === now.getUTCDate();

                
                    // 1. CURRENT: Anything scheduled for TODAY
                    if (isSameDay) {
                        // IT IS TODAY
                        if (now > end) {
                            // If End Time has passed -> HISTORY
                            history.push(session);
                        } else {
                            // If End Time has NOT passed (Active or Later Today) -> CURRENT
                            current.push(session);
                        }
                    } 
                    else if (now < start) {
                        // Future Date -> UPCOMING
                        upcoming.push(session);
                    } 
                    else {
                        // Past Date -> HISTORY
                        history.push(session);
                    }

                } catch (innerError) {
                    // Catch errors for specific bad records so the dashboard still loads
                    console.error("Skipping bad session record:", session._id, innerError);
                }
            });

            current.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
            upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            history.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

             const totalPlanned = current.length + upcoming.length + history.length;
            
            res.json({
                success: true,
                data: {
                    // CHANGE: Return the FULL arrays, not just the first index [0]
                    current: current, // This remains a single object or null based on your logic
                    upcoming: upcoming, 
                    history: history,    
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
        console.log(`=== UPDATE SESSION REQUEST (${req.params.id}) ===`);
        
        const { trainer, date, startTime, endTime, venue, totalTrainees } = req.body;

        // Validation
        if (!trainer || !date || !startTime || !endTime || !venue || !totalTrainees) {
            return res.status(400).json({
                success: false,
                msg: 'All fields are required'
            });
        }

        try {
            const parsedDate = parseFlutterDate(date);
            if (!parsedDate || isNaN(parsedDate)) {
                 return res.status(400).json({ success: false, msg: 'Invalid Date Format' });
            }

            let session = await Session.findById(req.params.id);
            if (!session) {
                return res.status(404).json({ success: false, msg: 'Session not found' });
            }

            // 2. Handle Start/End Time (FIXED FOR UPDATE)
            // We apply the +8 Hour shift here so MongoDB saves "18:16" instead of "10:16"
            const mytStartTime = forceMalaysiaTime(startTime);
            const mytEndTime = forceMalaysiaTime(endTime);

            // Update fields
            session.trainer = trainer;
            
            // ✅ FIX HERE: Use 'parsedDate' (UTC) instead of 'new Date(date)' (Local)
            // This prevents the -8 hour shift that changes "Dec 4" to "Dec 3".
            session.date = parsedDate; 
            
            session.startTime = mytStartTime;
            session.endTime = mytEndTime;
            // session.date = parsedDate;
            // session.time = time;
            session.venue = venue;
            session.totalTrainees = parseInt(totalTrainees);

            await session.save();

            console.log('✅ Session updated successfully');

            res.status(200).json({
                success: true,
                msg: 'Session updated successfully',
                data: session
            });

        } catch (err) {
            console.error('💥 Update Error:', err);
            next(err);
        }
    }));

    return router;
};