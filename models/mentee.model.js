const mongoose = require('mongoose');

const menteeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'mentee'
    },
    fieldOfInterest: {
        type: String,
        required: true
    },
    education: {
        type: String,
        required: true
    },
    skills: [{
        type: String
    }],
    briefBio: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastActive: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Mentee', menteeSchema); 