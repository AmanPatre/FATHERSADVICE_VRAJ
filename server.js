const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require("./models/user.model.js");
const Mentor = require('./models/mentor.model.js');
const app = express();
const MentorProfile = require('./models/mentor.after.profile.model.js'); // Import the schema
const { authenticateToken }= require('./middleware/authentication.middleware.js')
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser'); // Ensure this is imported


// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
    });



// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // Add this before any routes or middleware using req.cookies
// Set the view engine to EJS
app.set('view engine', 'ejs');

// Specify the views folder for EJS templates
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve static files
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/html', express.static(path.join(__dirname, 'public', 'html')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';



// Serve the main index.html file
app.get('/', (req, res) => {
    if (!req.session.userId) {
        // Allow public access to home page
        res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
    } else {
        // If logged in, redirect to the profile page
        res.redirect('/profile');
    }
});

app.get('/html/login.html',(req,res)=>{
    res.redirect('/html/login.html');
});



// Signup Route
app.post('/signup', async (req, res) => {
    try {
        // Extract form data
        const { name, email, password, role, phone, address } = req.body;

        // Input validation
        if (!name || !email || !password || !role || !phone || !address) {
            return res.status(400).send('All fields are required');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).send('Invalid email format');
        }

        // Validate role
        if (!['mentee', 'mentor'].includes(role)) {
            return res.status(400).send('Invalid role selected');
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('Email already registered');
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user object
        const userData = {
            name,
            email,
            password: hashedPassword,
            role,
            phone,
            address
        };

        // Save based on role
        let savedUser;
        if (role === 'mentor') {
            const mentor = new Mentor(userData);
            savedUser = await mentor.save();
        } else {
            const user = new User(userData);
            savedUser = await user.save();
        }

        // Success response
        console.log(`New ${role} created:`, savedUser);
        res.redirect('/html/login.html');

    } catch (error) {
        console.error('Signup error:', error);
        
        // Handle specific errors
        if (error.code === 11000) { // MongoDB duplicate key error
            return res.status(400).send('Email already registered');
        }
        
        res.status(500).send('Internal server error');
    }
});


// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        let user = role === 'mentor' ? await Mentor.findOne({ email }) : await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password) || user.role !== role) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

        // Set token in an HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Secure in production
            maxAge: 3600000 // 1 hour in milliseconds
        });

        res.status(200).json({ message: 'Login successful', role });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/mentee-dashboard', authenticateToken, (req, res) => {
    if (req.user.role !== 'mentee') {
        return res.status(403).json({ error: 'Unauthorized access' });
    }
    res.send('Welcome to Mentee Dashboard');
});


// Mentor Dashboard Route
app.get('/mentor-dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentor') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        const mentor = await Mentor.findById(req.user.userId);
        if (!mentor) {
            return res.status(404).json({ error: 'Mentor not found' });
        }

        res.render('mentor_profile', {
            user: {
                name: mentor.name,
                email: mentor.email,
                role: mentor.role,
                mentorsConnected: 0,
                mentorshipHours: 0,
                successStories: 'N/A',
                activeMentors: 0
            }
        });
    } catch (error) {
        console.error('Mentor dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.redirect('/');
    });
});


// Add this to your server.js
app.post('/find-mentor', async (req, res) => {
    const { education, field, location, details } = req.body;

    // Check if all required fields are filled
    if (!education || !field || !location) {
        return res.status(400).send('Please fill in all the fields');
    }

    try {
        // Create a new document or process the data here
        const newRequest = new MentorRequest({
            education,
            field,
            location,
            details
        });

        // Save the data into a new collection (e.g., MentorRequests)
        await newRequest.save();

        // Redirect the user to a random mentor profile page (or show matching mentors)
        res.redirect(`/mentor-profile/${newRequest._id}`);
    } catch (error) {
        console.error('Error saving mentor request:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Mentor_profile after login 
app.get('/mentor_profile', async (req, res) => {
    res.render('mentor_after_profile');
});


app.post('/submit_profile', async (req, res) => {
    try {
        console.log(req.body); // Debugging: Check what data is received

        const { fieldOfInterest, yearOfExperience, skills } = req.body;

        // Check if all required fields are filled
        if (!fieldOfInterest || !yearOfExperience || !skills || skills.length === 0) {
            return res.status(400).json({ error: "All required fields must be filled" });
        }

        // Temporary Cloudinary URL
        const tempCloudinaryUrl = "https://res.cloudinary.com/demo/image/upload/sample.pdf";

        const mentor = new MentorProfile({
            fieldOfInterest,
            yearOfExperience,
            skills,
            availability: req.body.availability || "",
            briefBio: req.body.briefBio || "",
            uploadResume: tempCloudinaryUrl
        });

        await mentor.save();
        res.redirect('/mentor_profile.ejs',{mentor});
    } catch (error) {
        res.status(500).json({ error: "Failed to create mentor profile", details: error.message });
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});