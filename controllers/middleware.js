var jwt =  require('jsonwebtoken');


const {Login} = require('../models/login');


// Admin middleware
const isAdmin = async function (req,res,next) {
        const token = req.headers["token"];

        if (token){
            try {
                const decoded = jwt.verify(token, 'your-jwt-secret-key');
                const user = await Login.findOne({_id: decoded.LoginId, status: true});
                if(!user){
                    return res.status(401).json({status: false, message: 'Unauthorized access'});
                }
                
                if(user.role !== 'admin'){
                    return res.status(401).json({status: false, message: 'Only admin can access this route'});
                }
                req.user = user;

            }
            catch (error){
                return res.status(400).json({status: false,message: 'Unauthorized'})
            }
            
        }
        else {
            return res.status(401).json({status: false, message: 'Unauthorized access'});
        }

        next();
    }     
    


//user middleware
const isUser = async function (req,res,next) {
        const token = req.headers["token"];

        if(token) {
            try {
                const decoded = jwt.verify(token, 'your-jwt-secret-key');
                const user = await Login.findOne({_id: decoded.LoginId, status: true});

                if(!user) {
                    return res.status(401).json({status: false, message: 'Unauthorized access'});
                }

                if(user.role !== 'user') {
                    return res.status(401).json({status: false, message: 'Only user can access this route'});
                }
                req.user = user;
            } catch (error) {
                console.log(error);
                return res.status(400).json({status: false, message: 'Unauthorized'});
            }
        }
        else {
            return res.status(401).json({status: false, message: 'Unauthorized access'});
        }
        next();
    }




module.exports = {
    isAdmin, isUser
};




