const mongoose = require('mongoose');

const MentorProfileSchema = new mongoose.Schema({
    fieldOfInterest: { type: String, required: true },
    yearOfExperience: { type: Number, required: true },
    skills: { type: [String], required: true },
    briefBio: { type: String },
    uploadResume: { type: String }, // Store Cloudinary URL
}, { timestamps: true });

module.exports = mongoose.model('MentorProfile', MentorProfileSchema);
