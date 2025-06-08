const express = require('express');
const router = express();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');






const {Login} = require('../../../models/login');
const {Token} = require('../../../models/token');
const {isUser} = require('../../../controllers/middleware');
const {Category} = require('../../../models/category');
const {Room} = require('../../../models/room');
const {Booking} = require('../../../models/booking');
const {Otp} = require('../../../models/otp');
const sendMail = require('../../../controllers/email');



const jwtsecret = 'your-jwt-secret-key';

router.post('/user-register',async (req,res) => {
    try {
  
        
        const {name,phone,email,password,role} = req.body; 
        if(!name || !phone || !email || !password || !role){
            return res.status(400).json({status: false, message: 'All fields required!'});
        }

        const nameRegex = /^[a-zA-Z\s]+$/;
        if(!nameRegex.test(name)){
            return res.status(400).json({satus: false,message: 'Name must contain only alphabets!'});
        }

        const phoneRegex = /^[0-9]{10}$/;
        if(!phoneRegex.test(phone)){
            return res.status(400).json({status: false,message: 'Phone number should contain only numbers and of length 10!'});
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if(!emailRegex.test(email)){
            return res.status(400).json({status: false,message: 'Invalid email Format!'});
        }

        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;
        if(!passRegex.test(password)){
            return res.status(400).json({status: false,message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'});
        }

        if(role !== 'user'){
            return res.status(400).json({status: false,message: 'Role must be user'});      
        }

        const existingUser = await Login.findOne({email});
        if(existingUser && existingUser.isVerified) {
            return res.status(400).json({status: false,message: 'User already exists!'});
        }



        const newpassword = await bcryptjs.hash(password,10);

        const otpCode = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.deleteMany({email}); // Clear any existing OTPs for the email

        if(!existingUser) {
            const newUser = new Login({
            name: name,
            phone: phone,   
            email: email,
            password: newpassword,
            role: role
        });   
        const saveduser = await newUser.save();
        }
        else {
            existingUser.name = name;
            existingUser.phone = phone;
            existingUser.email = email;
            existingUser.password = newpassword;

            await existingUser.save();
        }

        const newUser = await Login.findOne({email});

        const newOtp = new Otp({
            LoginId: newUser._id,
            email: email,
            otp: otpCode,
            expiresAt: expiresAt
        });

        await newOtp.save();

        await sendMail.sendTextEmail(email, 'OTP for Registration', `Your OTP is ${otpCode}. It is valid for 5 minutes.`);


        

    res.status(201).json({status: true,message: 'User registered successfully'});



        
    } 
    catch (error) {
        console.log(error);
        
        res.status(500).json({status: false,message: 'Something went wrong'});
    }
   

});//end point 


//otp verification
router.post('/otp-verification', async (req,res) => {
    
    
})


// login user
router.post('/user-login', async (req,res) => {
    try {
        const { email, password } = req.body;

        if(!email || !password) {
            return res.status(400).json({status:false, message: 'All fields required!'});
        }

        const existingUser = await Login.findOne({email});
        if(!existingUser) {
            return res.status(400).json({status: false,message: 'User not found!'});
        }

        const isMatch = await bcryptjs.compare(password,existingUser.password);
        if(!isMatch) {
            return res.status(400).json({status:false, message: 'Invalid credentials!'});
        }

        const token = jwt.sign({
            LoginId: existingUser._id,
            role: existingUser.role
        },
        jwtsecret,{
            expiresIn: '2h'
        }
    );

    const userToken = new Token({
        LoginId: existingUser._id,
        token: token
    });

    await userToken.save();

    return res.status(200).json({status:true, message:'Login Successful!', token: token});


    } catch (error) {
        console.log(error);
        res.status(500).json({status: false,message: 'Something went wrong'});
        
    }
    
});

//search ccategories only name
router.get('/categories' ,isUser, async (req,res) => {
    try {
        const categories = await Category.find({status: true}).select('catname');
        return res.status(200).json({status:true, categories});
    } catch (error) {
        console.log(error);
        return res.status(500).json({status:false,message:'Something went wrong!'});
    }

    
});

router.post('/sendMail', async (req,res) => {
    try {
        const {to, subject, body} = req.body;
        
        
        if(!to || !subject || !body) {
            return res.status(400).json({status: false, message: 'All fields required!'});
        }

        await sendMail.sendTextEmail(to,subject,body);

        return res.status(200).json({status: true, message: 'Email sent successfully!'});   
        
    } catch (error) {
        console.log(error);
        return res.status(500).json({status: false, message: 'Something went wrong!'});
        
    }
    
} );







module.exports = router;

// This code defines an Express.js route for registering a new user in an admin panel.