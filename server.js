require('dotenv').config();
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
const cookieParser = require('cookie-parser');
const MenteeRequest = require('./models/mentee.request.model.js');
const { spawn } = require("child_process");
const axios = require('axios'); // Make sure axios is installed

// Ensure process.env is available
if (typeof process === 'undefined') {
    global.process = require('process');
}

// Ensure __dirname is available
if (typeof __dirname === 'undefined') {
    global.__dirname = path.dirname(require.main.filename);
}

console.log("MongoDB URI:", process.env.MONGO_URI); // Debugging
// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
    });
    
// Script to run the python files
const runPythonScript = (scriptName) => {
    console.log(`Starting ${scriptName}...`);
    const process = spawn("python", [scriptName]);

    process.stdout.on("data", (data) => {
        console.log(`Output from ${scriptName}: ${data.toString()}`);
    });

    process.stderr.on("data", (data) => {
        console.error(`Error from ${scriptName}: ${data.toString()}`);
    });

    process.on("close", (code) => {
        console.log(`${scriptName} exited with code ${code}`);
    });
};

// Start both Python scripts
runPythonScript("algo.py");
console.log("Algorithm script started");
runPythonScript("api.py");
console.log("API script started");

// Wait for Python servers to start before continuing
setTimeout(() => {
    // Test API connectivity
    axios.get('http://localhost:5001/test')
        .then(response => {
            console.log('API service is running:', response.data);
        })
        .catch(error => {
            console.error('Error connecting to API service:', error.message);
        });
        
    // No test endpoint in algo.py, but we'll log that we're assuming it's running
    console.log('Assuming algorithm service is running on port 5000');
}, 3000);

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

app.get('/mentee-dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentee') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        const mentee = await User.findById(req.user.userId);
        if (!mentee) {
            return res.status(404).json({ error: 'Mentee not found' });
        }

        res.render('mentee_profile.ejs', {
            student: {
                id: mentee._id,
                name: mentee.name,
                email: mentee.email,
                role: mentee.role,
                phone: mentee.phone || '',
                education: mentee.education || 0,
                institution: mentee.institution || 0,
                fieldOfInterest: mentee.fieldOfInterest || 0
            }
        });
    } catch (error) {
        console.error('Mentee dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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

        // Fetch the mentor's profile data
        const mentorProfile = await MentorProfile.findOne({ mentorId: req.user.userId });
        console.log('Found mentor profile:', mentorProfile); // Debugging

        res.render('mentor_profile', {
            user: {
                id: mentor._id,
                name: mentor.name,
                email: mentor.email,
                role: mentor.role,
                phone: mentor.phone || '',
                address: mentor.address || ''
            },
            profile: mentorProfile || {
                fieldOfInterest: '',
                yearOfExperience: 0,
                skills: [],
                availability: '',
                briefBio: '',
                uploadResume: ''
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

// Find Mentor Route
app.post('/find-mentor', authenticateToken, async (req, res) => {
    try {
        const { doubt } = req.body;

        // Check if doubt is filled
        if (!doubt) {
            return res.status(400).json({ error: 'Please enter your question' });
        }

        // Create new mentee request
        const newRequest = new MenteeRequest({
            menteeId: req.user.userId,
            doubt,
            status: 'pending'
        });

        await newRequest.save();
        console.log('Mentee doubt saved:', newRequest);

        // First: Send the doubt to the AI API for processing
        try {
            const aiResponse = await axios.post('http://localhost:5001/submit_doubt', {
                mentee_id: req.user.userId.toString(),
                doubt: doubt
            });
            console.log('Subject breakdown received:', aiResponse.data);
            
            // Save the breakdown back to the request
            newRequest.subjectBreakdown = aiResponse.data.subject_breakdown;
            await newRequest.save();
            
            // Second: Use the algo API to find the best mentor match
            try {
                const matchResponse = await axios.post('http://localhost:5000/match_advanced', {
                    mentee_id: req.user.userId.toString()
                });
                console.log('Mentor match received:', matchResponse.data);
                
                // Save the match information to the request
                if (matchResponse.data.match) {
                    newRequest.matchedMentorId = matchResponse.data.match.mentor_id;
                    newRequest.compatibilityScore = matchResponse.data.match.compatibility_score;
                    await newRequest.save();
                }
            } catch (algoError) {
                console.error('Error calling matching algorithm:', algoError);
                // Continue even if matching fails
            }
            
        } catch (apiError) {
            console.error('Error calling Python API:', apiError);
            // Continue with the request even if API call fails
        }

        // Redirect to dashboard with success message
        res.redirect('/mentee-dashboard?doubt=submitted');
    } catch (error) {
        console.error('Error saving mentee doubt:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Mentor_profile after login 
app.get('/mentor_profile', async (req, res) => {
    res.render('mentor_after_profile');
});

app.post('/submit_profile', authenticateToken, async (req, res) => {
   
    try {
        console.log('Received form data:', req.body); // Debugging

        const { fieldOfInterest, yearOfExperience, skills, availability, briefBio } = req.body;

        // Check if all required fields are filled
        if (!fieldOfInterest || !yearOfExperience || !skills) {
            return res.status(400).json({ error: "All required fields must be filled" });
        }

        // Convert skills string to array if it's a string
        const skillsArray = Array.isArray(skills) ? skills : skills.split(',').map(skill => skill.trim());

        // Temporary Cloudinary URL
        const tempCloudinaryUrl = "https://res.cloudinary.com/demo/image/upload/sample.pdf";

        const mentorProfile = new MentorProfile({
            mentorId: req.user.userId,
            fieldOfInterest,
            yearOfExperience,
            skills: skillsArray,
            availability: availability || "",
            briefBio: briefBio || "",
            uploadResume: tempCloudinaryUrl
        });

        console.log('Saving mentor profile:', mentorProfile); // Debugging
        await mentorProfile.save();
        console.log('Profile saved successfully'); // Debugging

        res.redirect('/mentor-dashboard');
    } catch (error) {
        console.error('Error saving mentor profile:', error); // Debugging
        res.status(500).json({ error: "Failed to create mentor profile", details: error.message });
    }
});

// Mentee Request Page Route
app.get('/mentee-request', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentee') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        res.render('mentee_request');
    } catch (error) {
        console.error('Mentee request page error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Mentor Match Results
app.get('/mentor-match-results', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentee') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        
        // Find the latest mentee request
        const latestRequest = await MenteeRequest.findOne({ 
            menteeId: req.user.userId 
        }).sort({ createdAt: -1 });
        
        if (!latestRequest) {
            return res.status(404).json({ error: 'No mentor match found' });
        }
        
        // Get matched mentor details if there is a match
        let matchedMentor = null;
        if (latestRequest.matchedMentorId) {
            matchedMentor = await Mentor.findById(latestRequest.matchedMentorId);
        }
        
        res.render('mentor_match_results', {
            request: latestRequest,
            mentor: matchedMentor,
            compatibilityScore: latestRequest.compatibilityScore || 0
        });
    } catch (error) {
        console.error('Error fetching mentor match results:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});