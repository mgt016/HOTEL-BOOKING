const express = require('express');
const router = express();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pdfMakePrinter = require('pdfmake');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const { Login } = require('../../models/login');
const { Token } = require('../../models/token');
const { isAdmin, isUser } = require('../../controllers/middleware');
const { Category } = require('../../models/category');
const { Room } = require('../../models/room');
const { Otp } = require('../../models/otp');
const sendMail = require('../../controllers/email');
const { Booking } = require('../../models/booking');

const jwtsecret = 'your-jwt-secret-key';

router.post('/register', async (req, res) => {
    try {
        const { name, phone, email, password, role } = req.body;
        if (!name || !phone || !email || !password || !role) {
            return res.status(400).json({ status: false, message: 'All fields required!' });
        }

        const nameRegex = /^[a-zA-Z\s]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ status: false, message: 'Name must contain only alphabets!' });
        }

        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ status: false, message: 'Phone number should contain only numbers and of length 10!' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ status: false, message: 'Invalid email Format!' });
        }

        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;
        if (!passRegex.test(password)) {
            return res.status(400).json({
                status: false,
                message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
            });
        }

        const newpassword = await bcryptjs.hash(password, 10);

        // ---------------- ADMIN REGISTRATION ----------------
        if (role === 'admin') {
            const adminCount = await Login.countDocuments({ role: 'admin' });
            if (adminCount >= 1) {
                return res.status(400).json({ status: false, message: 'Admin already exists!' });
            }

            const newAdmin = new Login({ name, phone, email, password: newpassword, role });
            const savedAdmin = await newAdmin.save();

            const token = jwt.sign({ LoginId: savedAdmin._id, role: savedAdmin.role }, jwtsecret, { expiresIn: '2h' });
            const userToken = new Token({ LoginId: savedAdmin._id, token });
            await userToken.save();

            return res.status(201).json({ status: true, message: 'Admin registered successfully', token });
        }

        // ---------------- USER REGISTRATION ----------------
        else if (role === 'user') {
            const existingUser = await Login.findOne({ email });

            if (existingUser && existingUser.isVerified) {
                return res.status(400).json({ status: false, message: 'User already exists!' });
            }

            const otpCode = Math.floor(100000 + Math.random() * 900000);
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

            await Otp.deleteMany({ email });

            if (!existingUser) {
                const newUser = new Login({ name, phone, email, password: newpassword, role });
                await newUser.save();
            } else {
                existingUser.name = name;
                existingUser.phone = phone;
                existingUser.password = newpassword;
                await existingUser.save();
            }

            const user = await Login.findOne({ email });
            const newOtp = new Otp({ LoginId: user._id, email, otp: otpCode, expiresAt });
            await newOtp.save();

            await sendMail.sendTextEmail(email, 'OTP for Registration', `Your OTP is ${otpCode}. It is valid for 5 minutes.`);

            return res.status(201).json({ status: true, message: 'User registered successfully. OTP sent to email.' });
        }

        // ---------------- INVALID ROLE ----------------
        else {
            return res.status(400).json({ status: false, message: 'Role must be either admin or user!' });
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});


// ------------------------------ OTP VERIFICATION ------------------------------
router.post('/user/otp-verification/:otp', async (req, res) => {
    try {
        const otpCode = req.params.otp;
        const { email } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({ status: false, message: "All fields required!" });
        }

        const verifyOtp = await Otp.findOne({ email, otp: otpCode });

        if (!verifyOtp) return res.status(400).json({ status: false, message: 'Invalid OTP!' });

        if (parseInt(verifyOtp.otp) !== parseInt(otpCode)) return res.status(400).json({ status: false, message: 'Invalid OTP!' });

        if (verifyOtp.expiresAt < new Date()) return res.status(400).json({ status: false, message: 'OTP expired!' });

        const user = await Login.findById(verifyOtp.LoginId);
        if (!user) return res.status(404).json({ status: false, message: 'User not found!' });

        user.isVerified = true;
        await user.save();
        await Otp.deleteOne({ _id: verifyOtp._id });


        res.status(200).json({ status: true, message: 'OTP verified successfully!' });

    } catch (error) {
        console.log(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

// ------------------------------ UNIVERSAL LOGIN ------------------------------
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

        // If user is not admin, check for OTP verification
        if (existingUser.role === 'user' && !existingUser.isVerified) {
            return res.status(400).json({ status: false, message: 'User not verified. Please complete OTP verification.' });
        }

        const token = jwt.sign(
            { LoginId: existingUser._id, role: existingUser.role },
            jwtsecret,
            { expiresIn: '2h' }
        );

        const userToken = new Token({ LoginId: existingUser._id, token });
        await userToken.save();

        return res.status(200).json({
            status: true,
            message: 'Login successful',
            token,
            role: existingUser.role
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

// ------------------------------ ADMIN: ADD CATEGORY ------------------------------
router.post('/admin/add-category', isAdmin, async (req, res) => {
    try {
        const { catname, total_rooms, available_rooms, pricepernight } = req.body;
        if (!catname || !available_rooms || !pricepernight || !total_rooms) 
            return res.status(400).json({ status: false, message: "All fields required!" });

        const existingCategory = await Category.findOne({ catname });
        if (existingCategory) return res.status(400).json({ status: false, message: "Category already exists!" });

        const newCategory = new Category({ catname, total_rooms, available_rooms, pricepernight});
        const savedCategory = await newCategory.save();

        res.status(201).json({ status: true, message: "Category added successfully", category: savedCategory });

    } catch (error) {
        console.log(error);
        res.status(500).json({ status: false, message: "Something went wrong" });
    }
});

// ------------------------------ ADMIN: GET ALL CATEGORIES ------------------------------
router.get('/admin/categories', isAdmin, async (req, res) => {
    try {
        const categories = await Category.find({ status: true });
        res.status(200).json({ status: true, categories });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

// ------------------------------ ADMIN: UPDATE AND DELETE CATEGORY ------------------------------
router.put('/admin/category/:id', isAdmin, async (req, res) => {
    try {
        const { catname, total_rooms, available_rooms, pricepernight } = req.body;
        if (!catname) return res.status(400).json({ status: false, message: 'Category name is required!' });

        const updatedCategory = await Category.findByIdAndUpdate(req.params.id, { 
            catname,
            total_rooms,
            available_rooms,
            pricepernight
        }, 
        { new: true , runValidators: true});

        if (!updatedCategory) return res.status(404).json({ status: false, message: 'Category not found!' });

        res.status(200).json({ status: true, message: 'Category updated successfully', category: updatedCategory });

    } catch (error) {
        console.log(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

router.delete('/admin/category/:id', isAdmin, async (req, res) => {
    try {
        const deletedCategory = await Category.findByIdAndUpdate(req.params.id, { status: false }, { new: true });
        if (!deletedCategory) return res.status(404).json({ status: false, message: 'Category not found!' });

        res.status(200).json({ status: true, message: 'Successfully deleted!', Category: deletedCategory });

    } catch (error) {
        return res.status(500).json({ status: false, message: "Something went wrong" });
    }
});

// ------------------------------ ADMIN: DEACTIVATE USER ------------------------------
router.put('/admin/deactivate-user/:email', isAdmin, async (req, res) => {
    try {
        const userEmail = req.params.email;
        const user = await Login.findOne({ email: userEmail });

        if (!user) return res.status(400).json({ status: false, message: 'User not found!' });

        if (req.user.email === userEmail) {
            return res.status(400).json({ status: false, message: 'Admin cannot deactivate themselves!' });
        }

        user.status = false;
        await user.save();

        res.status(200).json({ status: true, message: 'User deactivated successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

// GET /admin/download-users?format=pdf OR format=excel
// Define fonts for pdfmake
const fonts = {
    Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
    }
};

// -------------------- Route --------------------
router.get('/admin/download-users', isAdmin, async (req, res) => {
    try {
        const format = req.query.format;
        const users = await Login.find({ role: { $ne: 'admin' } }).select('name email role');

        if (format === 'excel') {
            // Create Excel workbook
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Users');

            worksheet.columns = [
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Role', key: 'role', width: 15 }
            ];

            users.forEach(user => worksheet.addRow(user));

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');

            await workbook.xlsx.write(res);
            res.end();

        } else if (format === 'pdf') {
            // Create PDF with pdfmake
            const printer = new pdfMakePrinter(fonts);

            const body = [
                [{ text: 'Name', bold: true }, { text: 'Email', bold: true }, { text: 'Role', bold: true }]
            ];
            users.forEach(user => {
                body.push([user.name, user.email, user.role]);
            });

            const docDefinition = {
                content: [
                    { text: 'User List', style: 'header' },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', '*', '*'],
                            body
                        }
                    }
                ],
                styles: {
                    header: {
                        fontSize: 18,
                        bold: true,
                        margin: [0, 0, 0, 10]
                    }
                }
            };

            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=users.pdf');
            pdfDoc.pipe(res);
            pdfDoc.end();

        } else {
            return res.status(400).json({ status: false, message: 'Invalid format. Use ?format=pdf or ?format=excel' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: 'Something went wrong' });
    }
});

// ------------------------------ USER: CATEGORY NAMES ONLY ------------------------------
router.get('/user/categories', isUser, async (req, res) => {
    try {
        const categories = await Category.find({ status: true }).select('catname available_rooms pricepernight');
        return res.status(200).json({ status: true, categories });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, message: 'Something went wrong!' });
    }
});

// ------------------------------ SEND EMAIL ------------------------------
router.post('/sendMail', async (req, res) => {
    try {
        const { to, subject, body } = req.body;
        if (!to || !subject || !body) {
            return res.status(400).json({ status: false, message: 'All fields required!' });
        }

        await sendMail.sendTextEmail(to, subject, body);
        return res.status(200).json({ status: true, message: 'Email sent successfully!' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, message: 'Something went wrong!' });
    }
});

function isWithin3Days(date) {
    const today = new Date();
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + 3);
    return new Date(date) <= limitDate;
}

//room booking
router.post('/user/room-booking', isUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const categoryId = req.query.categoryId;
        const { no_of_rooms, checkin_date, checkout_date } = req.body;

        if (!no_of_rooms || !checkin_date || !checkout_date) {
            return res.status(400).json({ status: false, message: 'All fields required!' });
        }

        const checkin = new Date(checkin_date);
        const checkout = new Date(checkout_date);

        if (!isWithin3Days(checkin)) {
            return res.status(400).json({ status: false, message: 'Check-in date must be within 3 days from today.' });
        }

        if (checkout <= checkin) {
            return res.status(400).json({ status: false, message: 'Check-out must be after check-in.' });
        }

// check total active bookings on that check-in date
        const activeBookingCount = await Booking.countDocuments({
            checkin_date: checkin,
            status: true
        });

        if (activeBookingCount >= 15) {
            return res.status(400).json({ status: false, message: 'Hotel has reached max 15 bookings for that day.' });
        }

        const category = await Category.findById(categoryId);
        if (!category || !category.status) {
            return res.status(404).json({ status: false, message: 'Selected category not found or inactive.' });
        }

        if(category.available_rooms < no_of_rooms){
            const bookingsThatEndToday=await Booking.aggregate(
            [
                {
                $match: {
                    Category: new mongoose.Types.ObjectId(categoryId),
                    checkout_date: {
                        $gte: checkin,
                        $lt: new Date(checkin.getTime() + 24 * 60 * 60 * 1000),
                      }
                },
            },
            {
                $group: {
                _id: null,
                roomsFreed: { $sum: "$noofroomsbooked" },
                },
            },
          
            ]
        )

       const roomsToFree = bookingsThatEndToday[0]?.roomsFreed || 0;

        if (roomsToFree > 0) {
    // "Return" the rooms to category pool
            category.available_rooms += roomsToFree;
            await category.save(); // update immediately
        }

  // Re-check again
        if (category.available_rooms < no_of_rooms) {
            return res.status(400).json({
            status: false,
            message: "Not enough rooms available even after checking same-day checkouts",
        });
        }

        }

        if (category.available_rooms < no_of_rooms) {
            return res.status(400).json({ status: false, message: 'Not enough rooms available.' });
        }

        const total_amount =  no_of_rooms * category.pricepernight
        const booking = new Booking({
            user: userId,
            Category: categoryId,
            no_of_rooms,
            checkin_date: checkin,
            checkout_date: checkout,
            total_amount: total_amount
        });

        await booking.save();

        // Reduce available rooms
        category.available_rooms -= no_of_rooms;
        await category.save();

        // Fetch user details (assuming Login model)
        const user = await Login.findById(userId);

        // Prepare HTML content for email
        const htmlContent = `
            Booking Confirmed
            Dear ${user.name},
            Your booking has been confirmed for ${no_of_rooms} room(s) in room type of ${category.catname} from 
            ${checkin.toDateString()} to ${checkout.toDateString()}
            Total Amount: ₹${total_amount}
            Thank you for choosing us!
        `;

        // Define the PDF content
        const docDefinition = {
            pageSize: "A4",
            pageOrientation: "landscape",
            pageMargins: [20, 40, 20, 40],
            content: [
                { text: "Booking Confirmation", style: "header" },
                { text: "\n" },
                { text: `Name: ${user.name}` },
                { text: `Check-In Date: ${checkin.toDateString()}` },
                { text: `Check-Out Date: ${checkout.toDateString()}` },
                { text: `Rooms Booked: ${no_of_rooms}` },
                { text: `Total Amount: ₹${total_amount}` },
                { text: `Category: ${category.catname}` },
            ],
            styles: {
                header: {
                    fontSize: 20,
                    bold: true,
                    alignment: "center",
                },
            },
        };

        // Use pdfMakePrinter to create PDF
        const printer = new pdfMakePrinter(fonts);
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        let chunks = [];

        pdfDoc.on("data", (chunk) => chunks.push(chunk));

        pdfDoc.on("end", async () => {
            const result = Buffer.concat(chunks);

            // Send email with PDF attachment
            await sendMail.sendTextEmail(
                user.email,
                "Booking Confirmed",
                htmlContent,
                [
                    {
                        filename: "booking.pdf",
                        content: result,
                        contentType: "application/pdf",
                    },
                ]
            );
        });

        pdfDoc.end();

        return res.status(200).json({ status: true, message: 'Room booked and invoice sent!' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: 'Something went wrong!' });
    }
});

router.post('/user/cancel/:bookingid', isUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const bookingId = req.params.bookingid;

    // Find the booking belonging to this user
    const booking = await Booking.findOne({ user: userId, _id: bookingId });

    // Validate booking existence and status
    if (!booking || booking.status === false) {
      return res.status(400).json({
        status: false,
        message: 'Booking not found or already cancelled'
      });
    }

    const roomsBooked = booking.no_of_rooms;

    // Use correct key name: booking.Category (capitalized in your Booking schema)
    const category = await Category.findById(booking.Category);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: 'Category not found'
      });
    }

    // Soft delete the booking
    booking.status = false;

    // Return rooms to availability
    category.available_rooms += roomsBooked;

    // Save both documents
    await category.save();
    await booking.save();

    return res.status(200).json({
      status: true,
      message: 'Booking cancelled successfully'
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: 'Something went wrong'
    });
  }
});


router.get("/getbookingdetails",isAdmin, async (req, res) => {
  try {
    const { firstDate, secondDate } = req.query;
    let filter = { status: true };

    if (firstDate && secondDate) {
      const start = new Date(new Date(firstDate).setHours(0, 0, 0, 0));
      const end = new Date(new Date(secondDate).setHours(23, 59, 59, 999));
      filter.checkin_date = { $gte: start, $lte: end };
    } else if (firstDate) {
      const date = new Date(firstDate);
      const start = new Date(date.setHours(0, 0, 0, 0));
      const end = new Date(date.setHours(23, 59, 59, 999));
      filter.checkin_date = { $gte: start, $lte: end };
    }

    const bookings = await Booking.find(filter)
      .populate({
        path: "user",
        select: "name email",
        model: "Login",
      })
      .populate({
        path: "Category",
        select: "catname",
        model: "Category",
      });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No bookings found",
      });
    }

    const docDefinition = {
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [20, 40, 20, 40],
      content: [
        { text: "All Bookings Report", style: "header" },
        {
          table: {
            headerRows: 1,
            widths: ["auto", "*", "*", "*", "auto", "auto", "auto"],
            body: [
              [
                "User",
                "Email",
                "Category",
                "Check-In",
                "Check-Out",
                "No of Rooms",
                "Amount",
              ],
              ...bookings.map((b) => [
                b.user?.name || "N/A",
                b.user?.email || "N/A",
                b.Category?.catname || "N/A",
                new Date(b.checkin_date).toLocaleDateString(),
                new Date(b.checkout_date).toLocaleDateString(),
                b.no_of_rooms.toString(),
                "₹" + b.total_amount.toString(),
              ]),
            ],
          },
        },
      ],

      styles: {
        header: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 10],
          alignment: "center",
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: "black",
        },
      },
    };

    const printer = new pdfMakePrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    let chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const result = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=bookings-report.pdf"
      );
      res.send(result);
    });

    pdfDoc.end();
  } catch (err) {
    console.error("Error generating booking report:", err);
    res.status(500).json({
      status: false,
      message: "Something went wrong while generating the report",
    });
  }
});


module.exports = router;
