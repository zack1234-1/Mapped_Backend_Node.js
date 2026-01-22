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
        unique: true, // This automatically creates a unique index
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
        required: true 
    },
    role: {
        type: String,
        enum: ['admin', 'instructor', 'trainee'],
        default: 'trainee'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Only create indexes for fields that don't already have unique: true
// Remove any line that creates an index for email
// ❌ DO NOT ADD: UserSchema.index({ email: 1 }, { unique: true });

// Only add indexes for non-unique fields or compound indexes
UserSchema.index({ name: 1 }); // Regular index for faster searching by name
UserSchema.index({ role: 1 }); // Index for filtering by role

// Fixed pre-save middleware
UserSchema.pre('save', async function(next) { 
    if (!this.isModified('password')) {
        return next();
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(this.password, salt);
        this.password = hashedPassword;
        this.updatedAt = Date.now();
        next();
    } catch (err) {
        next(err);
    }
});

// Update timestamp on update
UserSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

// Method to compare the entered password with the hashed password in the DB
UserSchema.methods.verifyPassword = async function(enteredPassword) {
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
        return ret;
    }
});

module.exports = mongoose.model('User', UserSchema);