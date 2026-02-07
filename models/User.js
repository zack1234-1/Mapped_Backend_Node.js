const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    username: { 
        type: String 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true 
    },
    phone: { 
        type: String 
    },
    country: { 
        type: String 
    },
    gender: { 
        type: String 
    },
    address: { 
        type: String 
    },
    avatar: { 
        type: String, 
        default: "" 
    },
    password: { 
        type: String,
        required: function() {
            return !this.googleId && !this.facebookId;
        }
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    facebookId: {
        type: String,
        unique: true,
        sparse: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    registrationMethod: {
        type: String,
        enum: ['email', 'google', 'facebook'],
        default: 'email'
    },
    lastLogin: {
        type: Date
    },
    role: {
        type: String,
        enum: ['admin', 'instructor', 'trainee'],
        default: 'trainee'
    },
    
    // --- NEW FIELDS FOR OTP RESET ---
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    // --------------------------------

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes
UserSchema.index({ name: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ email: 1 }); // Important for fast lookups during reset
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ facebookId: 1 }, { sparse: true });

// Pre-save middleware - hashes password and updates timestamp
UserSchema.pre('save', async function(next) {
    try {
        // Only hash password if it exists and is modified (works for registration & reset)
        if (this.password && this.isModified('password')) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(this.password, salt);
            this.password = hashedPassword;
        }
        this.updatedAt = Date.now();
        
        if (typeof next === 'function') {
            next();
        }
    } catch (err) {
        if (typeof next === 'function') {
            next(err);
        } else {
            throw err;
        }
    }
});

// Update timestamp on update
UserSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

// Method to compare passwords
UserSchema.methods.verifyPassword = async function(enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
    return this.name;
});

// Remove password from JSON output
UserSchema.set('toJSON', {
    transform: function(doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken; // Also hide OTP token from frontend responses
        delete ret.resetPasswordExpires;
        return ret;
    }
});

module.exports = mongoose.model('User', UserSchema);