const mongoose = require('mongoose');

const MentorProfileSchema = new mongoose.Schema({
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    fieldOfInterest: { type: String, required: true },
    yearOfExperience: { type: Number, required: true },
    skills: { type: [String], required: true },
    availability: { type: String, required: true },
    briefBio: { type: String, required: true },
    uploadResume: { type: String }, // Store Cloudinary URL
    profileCompleted: { type: Boolean, default: false },
    // Additional fields for matching algorithm
    expertise: {
        type: [String],
        required: true
    },
    education: {
        type: String,
        required: true
    },
    specializations: {
        type: [String],
        required: true
    },
    preferredTimeSlots: {
        type: [String],
        required: true
    },
    maxSessions: {
        type: Number,
        required: true,
        default: 5
    },
    sessionDuration: {
        type: Number,
        required: true,
        default: 60 // in minutes
    },
    rating: {
        type: Number,
        default: 0
    },
    totalSessions: {
        type: Number,
        default: 0
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    processedData: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MentorProfile', MentorProfileSchema);
