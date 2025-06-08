const mongoose = require('mongoose');
const loginSchema = new mongoose.Schema({
    email: {
        type: String
    },
    password: {
        type: String
    },
    role: {
        type: String,
        enum: ['admin', 'user','hotel_owner']
    },
    
    name: {
        type: String
    },
    phone: {
        type: Number
    },
    status: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}) 
const Login = mongoose.model('Login', loginSchema);

module.exports = {Login};

