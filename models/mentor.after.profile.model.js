const mongoose = require('mongoose');

const MentorProfileSchema = new mongoose.Schema({
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    fieldOfInterest: { type: String, required: true },
    yearOfExperience: { type: Number, required: true },
    skills: { type: [String], required: true },
    availability: { type: String },
    briefBio: { type: String },
    uploadResume: { type: String }, // Store Cloudinary URL
}, { timestamps: true });

module.exports = mongoose.model('MentorProfile', MentorProfileSchema);
