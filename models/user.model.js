const mongoose = require('mongoose');

// Create a User schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['mentee', 'mentor'] },
    phone: { type: String, required: false },
    address: { type: String, required: false }
}, { timestamps: true });

// Create a User model from the schema
const User = mongoose.model('User', UserSchema);

// Export the model
module.exports = User;