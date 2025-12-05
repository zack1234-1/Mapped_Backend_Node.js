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
        required: true 
    }
});

// Fixed middleware - remove next parameter and let async/await handle the flow
UserSchema.pre('save', async function() { 
    if (!this.isModified('password')) {
        return; // Just return, no next needed
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(this.password, salt);
        this.password = hashedPassword;
        // No next() call needed - the async function will complete naturally
    } catch (err) {
        // Throw the error and let Mongoose handle it
        throw err;
    }
});

// Method to compare the entered password with the hashed password in the DB
UserSchema.methods.verifyPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);