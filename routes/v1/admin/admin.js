const express = require('express');
const router = express();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');






const {Login} = require('../../../models/login');
const {Token} = require('../../../models/token');
const isAdmin = require('../../../controllers/middleware').isAdmin;
const {Category} = require('../../../models/category');
const {Room} = require('../../../models/room');

const jwtsecret = 'your-jwt-secret-key';

//Register endpoint
router.post('/register',async (req,res) => {
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

        if(role !== 'admin'){
            return res.status(400).json({status: false,message: 'Role must be admin or user'});      
        }
        
        const adminCount = await Login.countDocuments({role: admin});
        if(adminCount >= 1 && role === 'admin'){
            return res.status(400).json({status: false,message: 'Admin already exists!'});
        }


        const newpassword = await bcryptjs.hash(password,10);
        const newUser = new Login({
            name: name,
            phone: phone,   
            email: email,
            password: newpassword,
            role: role
        });   
        const saveduser = await newUser.save();

        const token = jwt.sign({
            LoginId: saveduser._id,
            role: saveduser.role
        },
        jwtsecret,
        {
            expiresIn: '2h'
        }
    );
    const userToken = new Token(
        {
            LoginId: saveduser._id,
            token: token
        }
    );
    await userToken.save();

    res.status(201).json({status: true,message: 'User registered successfully',token:token});



        
    } 
    catch (error) {
        console.log(error);
        
        res.status(500).json({status: false,message: 'Something went wrong'});
    }
   

});//end point

//Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: false, message: 'All fields required!' });
        }

        const existingUser = await Login.findOne({ email });
        if (!existingUser) {
            return res.status(400).json({ status: false, message: 'User not found!' });
        }

        const isMatch = await bcryptjs.compare(password, existingUser.password);
        if (!isMatch) {
            return res.status(400).json({ status: false, message: 'Invalid credentials!' });
        }

        const token = jwt.sign(
            {
                LoginId: existingUser._id,
                role: existingUser.role
            },
            jwtsecret,
            {
                expiresIn: '2h'
            }
        );

        const userToken = new Token({
            LoginId: existingUser._id,
            token: token
        });

        await userToken.save();

        res.status(200).json({
            status: true,
            message: 'Login successful',
            token: token,
            role: existingUser.role
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

//Add Category
router.post('/add-category', isAdmin, async (req, res) => {
    try {
        const { catname } = req.body;        
        if(!catname){
            return res.status(400).json({status: false, message: "Category name is required!"});
        }

        const existingCategory = await Category.findOne({catname: catname});
        if(existingCategory){           
            return res.status(400).json({status: false, message: "Category already exists!"});
        }
        const newCategory = new Category({
            catname: catname
        });
        const savedCategory = await newCategory.save();
        res.status(201).json({status: true, message: "Category added successfully", category: savedCategory});
    }
    catch (error) {
        console.log(error);
        res.status(500).json({status: false, message: "Something went wrong"});
    }
});

//read all categories
router.get('/categories', isAdmin, async (req, res) => {
    try {
        const categories = await Category.find({status: true});

        res.status(200).json({status: true, categories: categories});
    } catch (error) {
        console.error(error);
        res.status(500).json({status: false, message: 'Something went wrong'});
    }
});





//Update category by id
router.put('/category/:id', isAdmin, async (req, res) => {
    try {
        const {catname} = req.body;
        if(!catname){
            return res.status(400).json({status: false, message: 'Category name is required!'});
        }
        const updatedCategory = await Category.findByIdAndUpdate(
            req.params.id,
            {catname},
            {new: true}
        );
        if(!updatedCategory){
            return res.status(404).json({status: false, message: 'Category not found!'});
        }
        res.status(200).json({status: true, message: 'Category updated successfully', category: updatedCategory});

    }
    catch(error){
        console.log(error);
        res.status(500).json({status: false, message: 'Something went wrong'});
        
    }
});


//Delete category by id
router.delete('/category/:id', isAdmin, async (req, res) => {
    try {
        const deletedCategory = await Category.findByIdAndUpdate(
            req.params.id,
            {status: false},
            {new: true}
        );
        if(!deletedCategory) {
            return res.status(404).json({status: false,message: 'Category not found!'});
        }
        res.status(200).json({status: true,message:'Succesfully deleted!',Category: deletedCategory });
    } catch (error) {
        return res.status(500).json({status:false,message:"Something went wrong"});
    }

    });  

//deactivating user
router.put('/deactivate-user/:email', isAdmin, async (req,res) => {
    try {
        const userEmail = req.params.email;
        
        const user = await Login.findOne({email: userEmail});

        if(!user){
            return res.status(400).json({status: false, message: 'User not found!'});
        }

        if(req.user.email === userEmail){
            return res.status(400).json({status: false, message: 'Admin cannot deactivate themselves!'});
        }

        user.status = false;
        await user.save();
        res.status(200).json({ status: true, message: 'User deactivated successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }    
});





module.exports = router;

