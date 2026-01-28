const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TraineeSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    belt: {
        type: String,
        required: [true, 'Belt is required'],
        trim: true,
        enum: {
            values: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black'],
            message: '{VALUE} is not a valid belt color'
        }
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required'],
        validate: {
            validator: function(value) {
                return value < new Date();
            },
            message: 'Date of birth must be in the past'
        }
    },
    gender: {
        type: String,
        required: [true, 'Gender is required'],
        enum: {
            values: ['Male', 'Female', 'Other'],
            message: '{VALUE} is not a valid gender'
        }
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        match: [
            /^[0-9-]{9,15}$/, 
            'Please enter a valid phone number'
        ]
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
        maxlength: [200, 'Address cannot exceed 200 characters']
    },
    guardianName: {
        type: String,
        required: [true, 'Guardian name is required'],
        trim: true,
        maxlength: [100, 'Guardian name cannot exceed 100 characters']
    },
    guardianContact: {
        type: String,
        required: [true, 'Guardian contact is required'],
        trim: true,
        match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid guardian contact number']
    },
    guardianAddress: {
        type: String,
        required: [true, 'Guardian address is required'],
        trim: true,
        maxlength: [200, 'Guardian address cannot exceed 200 characters']
    },
    image: {
        type: String,
        default: null,
        validate: {
            validator: function(value) {
                if (!value) return true; // Optional field
                return value.match(/\.(jpg|jpeg|png|gif)$/i);
            },
            message: 'Please provide a valid image URL (jpg, jpeg, png, gif)'
        }
    }
}, {
    timestamps: true // This automatically adds createdAt and updatedAt
});

// Index for better query performance
TraineeSchema.index({ email: 1 });
TraineeSchema.index({ belt: 1 });
TraineeSchema.index({ createdAt: -1 });

// Virtual for age calculation
TraineeSchema.virtual('age').get(function() {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
});

// Ensure virtual fields are serialized
TraineeSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Trainee', TraineeSchema);