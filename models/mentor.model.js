// models/MentorRequest.js
const mongoose = require('mongoose');

const MentorRequestSchema =  new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['mentee', 'mentor'] },
    phone: { type: String, required: true },
    address:{type:String,required:true}
}, { timestamps: true });

const Mentor = mongoose.model('Mentor', MentorRequestSchema);

module.exports = Mentor;
