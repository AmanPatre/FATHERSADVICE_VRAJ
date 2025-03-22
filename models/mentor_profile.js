const mongoose = require('mongoose');

const MentorProfileSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    fieldOfInterest: {
        type: String,
        required: true,
    },
    yearOfExperience: {
        type: Number,
        required: true,
    },
    educationalBackground: {
        type: String,
        required: true,
    },
    certifications: {
        type: [String], // Array of strings to hold multiple certifications
    },
    skills: {
        type: [String], // Array of strings to hold multiple skills
    },

    previousJob: {
        type: String,
    },
    linkedInProfile: {
        type: String,
    },
    availability: {
        type: String,
    },
    briefBio: {
        type: String,
    },
    uploadResume: {
        type: String, // Assuming this will be a URL or path to the uploaded resume
    }
});

module.exports = mongoose.model('MentorProfile', MentorProfileSchema);   
