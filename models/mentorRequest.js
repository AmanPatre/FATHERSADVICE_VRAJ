// models/MentorRequest.js
const mongoose = require('mongoose');

const MentorRequestSchema = new mongoose.Schema({
    education: { type: String, required: true },
    field: { type: String, required: true },
    location: { type: String, required: true },
    details: { type: String },
}, { timestamps: true });

const MentorRequest = mongoose.model('MentorRequest', MentorRequestSchema);

module.exports = MentorRequest;
