const mongoose = require('mongoose');
const roomSchema = new mongoose.Schema({
    roomno: {
        type: Number
    },
    no_of_rooms: {
        type: Number
    },
    available_rooms: {
        type: Number
    },
    status: {
        type: Boolean,
        default: true,
    }
});

const Room = mongoose.model('Room', roomSchema);

module.exports = {Room}