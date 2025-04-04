const mongoose = require('mongoose');

const doubtSchema = new mongoose.Schema({
    menteeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mentee',
        required: true
    },
    mentorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mentor',
        required: true
    },
    question: {
        type: String,
        required: true
    },
    answer: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'answered'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    answeredAt: {
        type: Date
    }
});

module.exports = mongoose.model('Doubt', doubtSchema); 