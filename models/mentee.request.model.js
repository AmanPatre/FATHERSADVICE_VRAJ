const mongoose = require('mongoose');

const MenteeRequestSchema = new mongoose.Schema({
    menteeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    doubt: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        default: 'pending',
        enum: ['pending', 'answered', 'closed']
    },
    answer: {
        type: String
    },
    answeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mentor'
    },
    answeredAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('MenteeRequest', MenteeRequestSchema); 