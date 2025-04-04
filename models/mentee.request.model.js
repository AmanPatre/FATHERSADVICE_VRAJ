const mongoose = require('mongoose');

const MenteeRequestSchema = new mongoose.Schema({
    mentee: { 
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
        enum: ['pending', 'processing', 'completed', 'error', 'answered', 'closed']
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
    },
    matchedMentorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mentor'
    },
    compatibilityScore: {
        type: Number,
        min: 0,
        max: 100
    },
    subjectBreakdown: {
        type: Map,
        of: Number
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

// Update the updatedAt field before saving
MenteeRequestSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const MenteeRequest = mongoose.model('MenteeRequest', MenteeRequestSchema);

module.exports = MenteeRequest; 