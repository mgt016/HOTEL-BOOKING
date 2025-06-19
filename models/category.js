const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema({
    catname: {
        type: String
    },
    total_rooms: {
        type: Number
    },
    available_rooms: {
        type: Number
    },
    pricepernight: {
        type: Number
    },
    status: {
        type: Boolean,
        default: true
    }

})

const Category = mongoose.model('Category', categorySchema);

module.exports = {Category};
