const mongoose = require('mongoose');

const MenteeRequestSchema = new mongoose.Schema({
    menteeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    education: { 
        type: String, 
        required: true,
        enum: ['high_school', 'bachelors', 'masters', 'phd']
    },
    field: { 
        type: String, 
        required: true,
        enum: ['technology', 'business', 'science', 'arts', 'engineering', 'medicine']
    },
    location: { 
        type: String, 
        required: true,
        enum: ['online', 'local', 'hybrid']
    },
    details: { 
        type: String 
    },
    preferredSchedule: { 
        type: String, 
        required: true,
        enum: ['weekday_morning', 'weekday_evening', 'weekend', 'flexible']
    },
    duration: { 
        type: String, 
        required: true,
        enum: ['1_month', '3_months', '6_months', '1_year']
    },
    status: { 
        type: String, 
        default: 'pending',
        enum: ['pending', 'matched', 'completed', 'cancelled']
    },
    matchedMentorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Mentor' 
    }
}, { timestamps: true });

module.exports = mongoose.model('MenteeRequest', MenteeRequestSchema); 