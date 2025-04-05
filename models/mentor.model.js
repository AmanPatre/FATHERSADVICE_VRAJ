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
    totalSessions: { type: Number, default: 0 },
    // New fields for matching algorithm
    subject_breakdown: {
        results: [{
            subject: { type: String },
            percentage: { type: Number }
        }]
    },
    processed_data: {
        basic_info: {
            name: String,
            email: String,
            is_online: Boolean,
            last_active: Date
        },
        expertise: {
            job_role: String,
            skills: [String],
            education: String,
            experience: Number,
            specializations: [String]
        },
        availability: {
            available_hours: Number,
            preferred_time_slots: [String],
            timezone: String
        },
        location: {
            country: String,
            city: String,
            timezone: String
        },
        workload: {
            current_sessions: Number,
            max_sessions: Number,
            session_duration: Number
        },
        matching_metrics: {
            skill_match_score: Number,
            experience_match_score: Number,
            availability_match_score: Number,
            location_match_score: Number,
            workload_score: Number,
            subject_match_score: Number,
            total_compatibility_score: Number
        }
    },
    profile_status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    profile_completed_at: { type: Date },
    last_updated: { type: Date, default: Date.now }
}, { timestamps: true });

const Mentor = mongoose.model('Mentor', MentorRequestSchema);

module.exports = Mentor;
