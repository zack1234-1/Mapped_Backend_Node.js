// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) console.log('Local test failed:', error);
  else console.log('Local test succeeded – ready to send');
});

// Email helper function
const sendEmail = async (options) => {
  try {
    await transporter.sendMail({
      from: `"Mapped Support" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 1. REGISTER
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      msg: 'User already exists'
    });
  }

  // Create new user
  const user = new User({
    name,
    email,
    password
  });

  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  res.status(201).json({
    success: true,
    msg: 'User registered successfully',
    token: token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    }
  });
}));

// 2. LOGIN
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  
  if (!user) {
    return res.status(400).json({
      success: false,
      msg: 'Invalid Credentials'
    });
  }

  // Check if user is blocked
  if (user.isBlocked === true) {
    return res.status(403).json({
      success: false,
      msg: 'You are being blocked. Please contact support.'
    });
  }

  // Verify password
  const isMatch = await user.verifyPassword(password);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      msg: 'Invalid Credentials'
    });
  }

  // Generate token
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    msg: 'Login successful',
    token: token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  });
}));

// 3. GET ALL USERS
router.get('/', asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json({
    success: true,
    data: users
  });
}));

// 4. GOOGLE REGISTER/LOGIN
router.post('/google-register', asyncHandler(async (req, res) => {
  const { uid, email, name } = req.body;

  // Check if user exists by email
  let user = await User.findOne({ email });

  if (user) {
    // User exists, update googleId if not set
    if (!user.googleId) {
      user.googleId = uid;
      await user.save();
    }
  } else {
    // Create new user
    user = new User({
      name: name || email.split('@')[0],
      email,
      googleId: uid,
      password: '' // Set empty password for Google users
    });
    await user.save();
  }

  // Generate token
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  res.status(200).json({
    success: true,
    message: 'Google authentication successful',
    token: token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    }
  });
}));

// 5. FORGOT PASSWORD
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      msg: 'Email is required'
    });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({
      success: false,
      msg: 'User not found'
    });
  }

  // Generate 4-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  user.resetPasswordToken = otp;
  user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Use the following 4-digit code to reset your password. Valid for 10 minutes.</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4CAF50; text-align: center; padding: 20px; background: #f9f9f9;">
            ${otp}
          </div>
        </div>
      `
    });
    
    res.json({
      success: true,
      msg: 'Code sent to email'
    });
  } catch (error) {
    // Reset token if email fails
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    res.status(500).json({
      success: false,
      msg: 'Email could not be sent'
    });
  }
}));

// 6. VERIFY OTP
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({
    email: email,
    resetPasswordToken: otp,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      msg: 'Invalid or expired code'
    });
  }

  res.json({
    success: true,
    msg: 'Code verified successfully'
  });
}));

  router.post('/reset-password', asyncHandler(async (req, res) => {
    let { email, newPassword } = req.body;

    // 1. Defensive Check: Standardize email input
    if (typeof email === 'object' && email.email) {
      email = email.email;
    } 
    
    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: 'User not found'
      });
    }

    user.password = newPassword; 

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({
      success: true,
      msg: 'Password reset successful'
    });
  }));


module.exports = router;