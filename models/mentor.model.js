// models/MentorRequest.js
const mongoose = require('mongoose');

const MentorRequestSchema =  new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['mentee', 'mentor'] },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    profileCompleted: { type: Boolean, default: false },
    fieldOfInterest: { type: String },
    yearOfExperience: { type: Number },
    skills: { type: [String] },
    availability: { type: String },
    briefBio: { type: String },
    education: { type: String },
    expertise: { type: [String] },
    specializations: { type: [String] },
    preferredTimeSlots: { type: [String] },
    maxSessions: { type: Number, default: 5 },
    sessionDuration: { type: Number, default: 60 },
    isOnline: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    rating: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 }
}, { timestamps: true });

const Mentor = mongoose.model('Mentor', MentorRequestSchema);

module.exports = Mentor;
