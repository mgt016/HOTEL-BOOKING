const mongoose = require('mongoose');
const bookingSchema = new mongoose.Schema({
    roomno: {
        type: Number,
        required: true
    },
    no_of_rooms: {
        type: Number,
        required: true
    },
    checkin_date: {
        type: Date,
        required: true
    },
    checkout_date: {
        type: Date,
        required: true
    },
    total_amount: {
        type: Number,
        required: true
    },
    status: {
        type: Boolean,
        default: true
    }
})

const Booking = new mongoose.model('Booking', bookingSchema);
module.exports = {Booking};
