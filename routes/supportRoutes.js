const express = require('express');
const router = express.Router();
const Support = require('../models/support');
const mongoose = require('mongoose');

// ==========================================
// PUBLIC ROUTES (With User Authentication)
// ==========================================

// CREATE TICKET
router.post('/tickets', async (req, res) => {
    try {
        const { title, description, userId } = req.body;

        // Validation
        if (!title || !description || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide title, description, and userId',
            });
        }

        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format',
            });
        }

        // Create ticket
        const ticket = await Support.create({
            userId,
            title: title.trim(),
            description: description.trim(),
        });

        // Populate user data
        await ticket.populate('userId', 'name email username');

        console.log(`[Support] Ticket created: ${ticket._id} by user ${userId}`);

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: ticket,
        });
    } catch (err) {
        console.error('Create ticket error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// GET USER TICKETS
router.get('/tickets/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format',
            });
        }

        // Get tickets
        const tickets = await Support.find({ userId })
            .sort({ createdAt: -1 })
            .populate('userId', 'name email username')
            .populate('assignedTo', 'name email')
            .populate('responses.respondedBy', 'name email');

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets,
        });
    } catch (err) {
        console.error('Fetch user tickets error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// GET SINGLE TICKET BY ID
router.get('/tickets/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;

        // Validate ticketId format
        if (!mongoose.Types.ObjectId.isValid(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID format',
            });
        }

        // Get ticket
        const ticket = await Support.findById(ticketId)
            .populate('userId', 'name email username')
            .populate('assignedTo', 'name email')
            .populate('responses.respondedBy', 'name email');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found',
            });
        }

        res.status(200).json({
            success: true,
            data: ticket,
        });
    } catch (err) {
        console.error('Fetch ticket error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// GET TICKET STATS (Admin)
router.get('/stats', async (req, res) => {
    try {
        const stats = await Support.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const total = await Support.countDocuments();

        res.status(200).json({
            success: true,
            data: {
                total,
                byStatus: stats,
            },
        });
    } catch (err) {
        console.error('Stats error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// GET ALL TICKETS (Admin) - MOVED AFTER SPECIFIC ROUTES
router.get('/tickets', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        // Build query
        const query = {};
        if (status) query.status = status;

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get tickets
        const tickets = await Support.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email username')
            .populate('assignedTo', 'name email');

        // Get total count
        const total = await Support.countDocuments(query);

        res.status(200).json({
            success: true,
            count: tickets.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            data: tickets,
        });
    } catch (err) {
        console.error('Admin fetch tickets error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// UPDATE TICKET STATUS (Admin)
router.put('/tickets/:ticketId/status', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status, assignedTo } = req.body;

        // Validate ticketId format
        if (!mongoose.Types.ObjectId.isValid(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID format',
            });
        }

        // Validate status
        const validStatuses = ['pending', 'resolved'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value',
            });
        }

        // Find ticket
        const ticket = await Support.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found',
            });
        }

        // Update status
        if (status) {
            // Check if model has method, otherwise manual update
            if (typeof ticket.updateStatus === 'function') {
                await ticket.updateStatus(status);
            } else {
                ticket.status = status;
                ticket.updatedAt = Date.now();
                await ticket.save();
            }
        }

        // Update assigned user
        if (assignedTo) {
            if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid assignedTo user ID',
                });
            }
            ticket.assignedTo = assignedTo;
            await ticket.save();
        }

        // Populate and return
        await ticket.populate('userId', 'name email username');
        await ticket.populate('assignedTo', 'name email');

        console.log(`[Support] Ticket ${ticketId} updated. Status: ${status}`);

        res.status(200).json({
            success: true,
            message: 'Ticket updated successfully',
            data: ticket,
        });
    } catch (err) {
        console.error('Update ticket status error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// ADD TICKET RESPONSE (Admin)
router.post('/tickets/:ticketId/response', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { message, respondedBy } = req.body;

        // Validation
        if (!message || !respondedBy) {
            return res.status(400).json({
                success: false,
                message: 'Please provide message and respondedBy',
            });
        }

        if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(respondedBy)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format',
            });
        }

        // Find ticket
        const ticket = await Support.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found',
            });
        }

        // Add response logic
        if (typeof ticket.addResponse === 'function') {
            await ticket.addResponse(message, respondedBy);
        } else {
            // Fallback if method doesn't exist on model - FIXED FIELD NAMES
            ticket.responses.push({
                message: message,  // ✅ Fixed: was 'response'
                respondedBy: respondedBy,
                respondedAt: Date.now()  // ✅ Fixed: was 'createdAt'
            });
            await ticket.save();
        }

        // Populate and return
        await ticket.populate('userId', 'name email username');
        await ticket.populate('responses.respondedBy', 'name email');

        res.status(200).json({
            success: true,
            message: 'Response added successfully',
            data: ticket,
        });
    } catch (err) {
        console.error('Add response error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

// DELETE TICKET (Admin)
router.delete('/tickets/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ticket ID format',
            });
        }

        const ticket = await Support.findByIdAndDelete(ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found',
            });
        }

        console.log(`[Support] Ticket deleted: ${ticketId}`);

        res.status(200).json({
            success: true,
            message: 'Ticket deleted successfully',
        });
    } catch (err) {
        console.error('Delete ticket error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Server Error: ' + err.message,
        });
    }
});

module.exports = router;