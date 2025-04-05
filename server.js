// Load environment variables
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
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Mentee = require('./models/mentee.model.js');
const Doubt = require('./models/doubt.model.js');
const Match = require('./models/match.model.js');
const Session = require('./models/session.model.js');


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
    const process = spawn("python3", [scriptName], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    process.stdout.on("data", (data) => {
        console.log(`Output from ${scriptName}: ${data.toString()}`);
    });

    process.stderr.on("data", (data) => {
        console.error(`Error from ${scriptName}: ${data.toString()}`);
    });

    process.on("error", (err) => {
        console.error(`Failed to start ${scriptName}:`, err);
    });

    process.on("close", (code) => {
        console.log(`${scriptName} exited with code ${code}`);
    });
};

// Start both Python scripts
async function startPythonServices() {
        try {
        console.log('Starting Python services...');
        
        // Start services in sequence to ensure proper initialization
            const services = [
            { name: 'mentor_processor.py', port: 5003 },
            { name: 'api.py', port: 5001 },
            { name: 'algo.py', port: 5000 }
        ];

        for (const service of services) {
            console.log(`Starting ${service.name} on port ${service.port}...`);
            const pythonProcess = spawn('python3', [service.name], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

            pythonProcess.stdout.on('data', (data) => {
                console.log(`${service.name} output:`, data.toString());
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`${service.name} error:`, data.toString());
            });

            pythonProcess.on('close', (code) => {
                console.log(`${service.name} exited with code ${code}`);
            });

            // Wait for service to start
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('All Python services started');
        return true;
        } catch (error) {
        console.error('Error starting Python services:', error);
        return false;
        }
}

// Wait for Python servers to start before continuing
async function waitForServices() {
    try {
        console.log('Waiting for services to be ready...');

        // Check each service's health endpoint
        const services = [
            { url: 'http://localhost:5003/health', name: 'Mentor Processor' },
            { url: 'http://localhost:5001/health', name: 'API' },
            { url: 'http://localhost:5000/health', name: 'Algorithm' }
        ];

        for (const service of services) {
            let retries = 3;
            while (retries > 0) {
                try {
                    const response = await axios.get(service.url);
                    console.log(`${service.name} is healthy:`, response.data);
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) {
                        console.error(`${service.name} failed health check`);
                        return false;
                    }
                    console.log(`Retrying ${service.name} health check... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        console.log('All services are healthy');
        return true;
    } catch (error) {
        console.error('Error checking service health:', error);
        return false;
    }
}

// Initialize the application
async function initializeApp() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Start Python services
        console.log('Starting Python services...');
        await startPythonServices();

        // Wait for services to be ready
        console.log('Waiting for services to be ready...');
        const servicesReady = await waitForServices();
        if (!servicesReady) {
            console.error('Some Python services failed to start. The application may not function correctly.');
        }

        // Configure middleware
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(cookieParser());
        app.use(session({
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: process.env.NODE_ENV === 'production' }
        }));

        // Serve static files
        app.use(express.static(path.join(__dirname, 'public')));

        // Set view engine
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, 'views'));

        // Start server
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // Add this before any routes or middleware using req.cookies
// Set the view engine to EJS
app.set('view engine', 'ejs');

// Specify the views folder for EJS templates
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Set to false for HTTP in development
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Add this after session middleware
app.use((req, res, next) => {
    // Initialize error message if it doesn't exist
    if (!req.session.errorMessage) {
        req.session.errorMessage = null;
    }
    next();
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/html', express.static(path.join(__dirname, 'public', 'html')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Define JWT_SECRET at the top level
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /pdf|doc|docx/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb('Error: Only PDF, DOC, and DOCX files are allowed!');
        }
    }
});

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Serve the main index.html file
app.get('/', (req, res) => {
    if (!req.session.userId) {
        // Allow public access to home page
        res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
    } else {
        // If logged in, redirect to the appropriate dashboard based on role
        if (req.session.user && req.session.user.role === 'mentor') {
            res.redirect('/mentor_dashboard');
        } else {
            res.redirect('/mentee_profile');
        }
    }
});

app.get('/html/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'login.html'));
});

// Login page route
app.get('/login', (req, res) => {
    // Get error message from session and clear it
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = null;
    
    // Render login page with error message if any
    res.render('login', { 
        errorMessage: errorMessage,
        user: req.session.user || null
    });
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        console.log('Login attempt:', { email, role });
        
        // Input validation
        if (!email || !password || !role) {
            console.log('Missing required fields');
            if (req.headers['content-type'] === 'application/json') {
            return res.status(400).json({ error: 'All fields are required' });
            }
            return res.redirect(`/html/login.html?error=${encodeURIComponent('All fields are required')}`);
        }

        // Find user based on role
        let user;
        if (role === 'mentor') {
            user = await Mentor.findOne({ email: email });
            console.log('Mentor found:', user ? 'Yes' : 'No');
            if (user) {
                console.log('Mentor details:', {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    profileCompleted: user.profileCompleted,
                    fullUser: JSON.stringify(user)
                });
            }
        } else if (role === 'mentee') {
            user = await User.findOne({ email: email, role: 'mentee' });
            console.log('Mentee found:', user ? 'Yes' : 'No');
            if (user) {
                console.log('Mentee details:', {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                });
            }
        }

        // Check if user exists
        if (!user) {
            console.log('User not found');
            if (req.headers['content-type'] === 'application/json') {
            return res.status(401).json({ error: 'Invalid email or password' });
            }
            return res.redirect(`/html/login.html?error=${encodeURIComponent('Invalid email or password')}`);
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('Password valid:', isPasswordValid);
        if (!isPasswordValid) {
            if (req.headers['content-type'] === 'application/json') {
            return res.status(401).json({ error: 'Invalid email or password' });
            }
            return res.redirect(`/html/login.html?error=${encodeURIComponent('Invalid email or password')}`);
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email, 
                role: user.role 
            }, 
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // Set to false for HTTP in development
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Set user info in session
        req.session.user = {
            id: user._id,
            email: user.email,
            role: user.role
        };

        // Handle role-specific redirects
        if (role === 'mentor') {
            console.log('Mentor profile check:', {
                mentorExists: !!user,
                profileCompleted: user.profileCompleted,
                mentorId: user._id,
                fullUser: JSON.stringify(user)
            });
            
            // If mentor has a completed profile, redirect to dashboard
            if (user.profileCompleted === true) {
                console.log('Redirecting to mentor dashboard - profile is completed');
                if (req.headers['content-type'] === 'application/json') {
            return res.json({ redirect: '/mentor_dashboard' });
                }
                return res.redirect('/mentor_dashboard');
            }
            
            // If profile is not completed, redirect to profile completion
            console.log('Redirecting to mentor_after_profile - profile not completed');
            if (req.headers['content-type'] === 'application/json') {
                return res.json({ redirect: '/mentor_after_profile' });
            }
            return res.redirect('/mentor_after_profile');
        } else {
            // For mentees, redirect directly to dashboard
            console.log('Redirecting mentee to profile page');
            if (req.headers['content-type'] === 'application/json') {
                return res.json({ redirect: '/mentee_profile' });
            }
            return res.redirect('/mentee_profile');
        }

    } catch (error) {
        console.error('Login error:', error);
        if (req.headers['content-type'] === 'application/json') {
        return res.status(500).json({ error: 'An error occurred during login' });
        }
        return res.redirect(`/html/login.html?error=${encodeURIComponent('An error occurred during login')}`);
    }
});

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, role, phone, address } = req.body;
        console.log('Signup attempt:', { name, email, role });
        
        // Input validation
        if (!name || !email || !password || !role) {
            console.log('Missing required fields');
            if (req.headers['content-type'] === 'application/json') {
                return res.status(400).json({ error: 'All fields are required' });
            }
            return res.redirect(`/html/signup.html?error=${encodeURIComponent('All fields are required')}`);
        }

        // Check if user already exists
        const existingUser = role === 'mentor' 
            ? await Mentor.findOne({ email: email })
            : await User.findOne({ email: email, role: 'mentee' });

        if (existingUser) {
            console.log('User already exists');
            if (req.headers['content-type'] === 'application/json') {
                return res.status(400).json({ error: 'User already exists' });
            }
            return res.redirect(`/html/signup.html?error=${encodeURIComponent('User already exists')}`);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user based on role
        let newUser;
        if (role === 'mentor') {
            newUser = new Mentor({
                name,
                email,
                password: hashedPassword,
                role,
                phone: phone || '',
                address: address || '',
                profileCompleted: false
            });
        } else {
            newUser = new User({
                name,
                email,
                password: hashedPassword,
                role,
                phone: phone || '',
                address: address || ''
            });
        }

        // Save user to database
        await newUser.save();
        console.log('New user created:', { id: newUser._id, email: newUser.email, role: newUser.role });

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: newUser._id, 
                email: newUser.email, 
                role: newUser.role 
            }, 
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // Set to false for HTTP in development
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Set user info in session
        req.session.user = {
            id: newUser._id,
            email: newUser.email,
            role: newUser.role
        };

        // Handle role-specific redirects
        if (role === 'mentor') {
            if (req.headers['content-type'] === 'application/json') {
                return res.json({ redirect: '/html/login.html?message=Signup successful! Please login to continue.' });
            }
            return res.redirect('/html/login.html?message=Signup successful! Please login to continue.');
        } else {
            if (req.headers['content-type'] === 'application/json') {
                return res.json({ redirect: '/html/login.html?message=Signup successful! Please login to continue.' });
            }
            return res.redirect('/html/login.html?message=Signup successful! Please login to continue.');
        }

    } catch (error) {
        console.error('Signup error:', error);
        if (req.headers['content-type'] === 'application/json') {
            return res.status(500).json({ error: 'An error occurred during signup' });
        }
        return res.redirect(`/html/signup.html?error=${encodeURIComponent('An error occurred during signup')}`);
    }
});

app.get('/mentee_profile', authenticateToken, async (req, res) => {
    try {
        console.log('Mentee profile route accessed:', {
            user: req.user,
            session: req.session.user,
            cookies: req.cookies
        });
        
        // Check if user is authenticated and is a mentee
        if (!req.user || req.user.role !== 'mentee') {
            console.log('User not authenticated or not a mentee:', req.user);
            return res.redirect('/login');
        }

        // Get mentee data
        const mentee = await User.findById(req.user.userId);
        console.log('Mentee found:', mentee ? {
                id: mentee._id,
                email: mentee.email,
            name: mentee.name,
                role: mentee.role,
            phone: mentee.phone,
            address: mentee.address
        } : 'No');
        
        if (!mentee) {
            console.log('Mentee not found in database');
            req.session.errorMessage = "Mentee not found";
            return res.redirect('/login');
        }

        // Ensure all required fields have default values
        const studentData = {
            _id: mentee._id,
            name: mentee.name || 'Not provided',
            email: mentee.email || 'Not provided',
            phone: mentee.phone || 'Not provided',
            address: mentee.address || 'Not provided',
            education: mentee.education || 'Not provided',
            institution: mentee.institution || 'Not provided',
            fieldOfInterest: mentee.fieldOfInterest || 'Not provided'
        };

        // Render the mentee profile
        console.log('Rendering mentee profile with data:', {
            student: studentData
        });
        
        res.render('mentee_profile', {
            student: studentData,
            errorMessage: req.session.errorMessage,
            successMessage: req.session.successMessage
        });

        // Clear messages after rendering
        req.session.errorMessage = null;
        req.session.successMessage = null;
    } catch (error) {
        console.error('Error in mentee profile route:', error);
        req.session.errorMessage = "An error occurred while loading the dashboard";
        res.redirect('/login');
    }
});

// Mentor Dashboard Route
app.get('/mentor_dashboard', authenticateToken, async (req, res) => {
    try {
        console.log('Mentor dashboard access attempt:', {
            user: req.user,
            session: req.session.user,
            cookies: req.cookies
        });
        
        // Set cache control headers to prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Check if user is authenticated and is a mentor
        if (!req.user || req.user.role !== 'mentor') {
            console.log('User not authenticated or not a mentor:', req.user);
            return res.redirect('/login');
        }

        // Get mentor data
        const mentor = await Mentor.findById(req.user.userId);
        console.log('Mentor found:', mentor ? {
            id: mentor._id,
            email: mentor.email,
            profileCompleted: mentor.profileCompleted,
            name: mentor.name
        } : 'No');

        if (!mentor) {
            console.log('Mentor not found in database');
            req.session.errorMessage = "Mentor not found";
            return res.redirect('/login');
        }

        // Check if profile is completed
        console.log('Mentor profile check:', {
            mentorExists: !!mentor,
            profileCompleted: mentor.profileCompleted,
            mentorId: mentor._id
        });
        
        if (mentor.profileCompleted !== true) {
            console.log('Profile not completed, redirecting to profile page');
            req.session.errorMessage = "Please complete your profile before accessing the dashboard";
            return res.redirect('/mentor_after_profile');
        }

        // Get processed mentor data from Python service - make it optional
        let processedData = null;
        try {
            const response = await axios.get(`http://localhost:5003/get_mentor_dashboard/${req.user.userId}`);
            if (!response.data.error) {
                processedData = response.data.dashboard_data;
                console.log('Processed mentor data retrieved successfully');
            }
        } catch (error) {
            console.log('Processed data not available, continuing without it');
        }

        // Prepare user data for template
        const userData = {
                id: mentor._id,
                name: mentor.name,
                email: mentor.email,
                role: mentor.role,
                phone: mentor.phone || '',
                address: mentor.address || ''
        };

        console.log('Rendering mentor dashboard with data:', {
            userData,
            profileCompleted: mentor.profileCompleted,
            hasProcessedData: !!processedData
        });

        // Render the mentor dashboard with all necessary data
        res.render('mentor_dashboard', {
            user: userData,
            profile: mentor,
            processedData: processedData,
            successMessage: req.session.successMessage,
            errorMessage: req.session.errorMessage
        });

        // Clear messages after rendering
        req.session.successMessage = null;
        req.session.errorMessage = null;
    } catch (error) {
        console.error('Mentor dashboard error:', error);
        req.session.errorMessage = "An error occurred while loading the dashboard";
        res.redirect('/login');
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

// Get offline mentors
app.get('/api/offline-mentors', authenticateToken, async (req, res) => {
    try {
        const mentors = await Mentor.find({}, 'name expertise experience rating skills fieldOfInterest')
            .limit(5); // Limit to 5 mentors for now
        
        res.json(mentors);
    } catch (error) {
        console.error('Error fetching offline mentors:', error);
        res.status(500).json({ error: 'Failed to fetch mentors' });
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
            mentee: req.user.userId 
        }).sort({ createdAt: -1 });
        
        if (!latestRequest) {
            return res.status(404).json({ error: 'No mentor match found' });
        }
        
        // Get matched mentor details if there is a match
        let matchedMentor = null;
        if (latestRequest.matchedMentorId) {
            matchedMentor = await Mentor.findById(latestRequest.matchedMentorId);
        }
        
        // Fetch offline mentors
        const offlineMentors = await Mentor.find({}, 'name expertise experience rating skills fieldOfInterest')
            .limit(5);
        
        res.render('matching_interface', {
            menteeRequest: latestRequest,
            mentor: matchedMentor,
            compatibilityScore: latestRequest.compatibilityScore || 0,
            status: latestRequest.status,
            title: 'Matching Interface',
            offlineMentors: offlineMentors || []
        });
    } catch (error) {
        console.error('Error fetching mentor match results:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Find Mentor Route
app.post('/find-mentor', authenticateToken, async (req, res) => {
    try {
        const { doubt } = req.body;
        const menteeId = req.user.userId;

        if (!doubt) {
            return res.status(400).json({ error: 'Doubt is required' });
        }

        // Create new mentee request
        const menteeRequest = new MenteeRequest({
            mentee: menteeId,
            doubt: doubt,
            status: 'pending'
        });
        await menteeRequest.save();

        // Call the Python API service
        try {
            const apiResponse = await axios.post('http://localhost:5001/submit_doubt', {
                mentee_id: menteeId,
                doubt: doubt
            });

            // Update request with subject breakdown
            menteeRequest.subjectBreakdown = apiResponse.data.subject_breakdown;
            await menteeRequest.save();

            // Call the matching algorithm
            const matchResponse = await axios.post('http://localhost:5000/match_advanced', {
                mentee_id: menteeId
            });

            if (matchResponse.data.match) {
                // Update request with match details
                menteeRequest.matchedMentorId = matchResponse.data.match.mentor_id;
                menteeRequest.compatibilityScore = matchResponse.data.match.compatibility_score;
                menteeRequest.status = 'answered';
                await menteeRequest.save();

                // Create a new session
                const session = new Session({
                    mentee: menteeId,
                    mentor: matchResponse.data.match.mentor_id,
                    status: 'active',
                    doubt: doubt
                });
                await session.save();
            }
        } catch (error) {
            console.error('Error in Python services:', error);
            // Continue with offline mentors if Python services fail
        }

        // Fetch offline mentors
        const offlineMentors = await Mentor.find({}, 'name expertise experience rating skills fieldOfInterest')
            .limit(5);

        // Render the matching interface
        res.render('matching_interface', {
            menteeRequest,
            mentor: menteeRequest.matchedMentorId ? await Mentor.findById(menteeRequest.matchedMentorId) : null,
            compatibilityScore: menteeRequest.compatibilityScore || 0,
            status: menteeRequest.status,
            title: 'Matching Interface',
            offlineMentors: offlineMentors || []
        });
    } catch (error) {
        console.error('Error in find-mentor:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Mentor profile route
app.get('/mentor_profile', authenticateToken, async (req, res) => {
    try {
        // Check if user is authenticated and is a mentor
        if (!req.user || req.user.role !== 'mentor') {
            return res.redirect('/login');
        }

        // Get mentor data
        const mentor = await Mentor.findById(req.user.userId);
        if (!mentor) {
            req.session.errorMessage = "Mentor not found";
            return res.redirect('/login');
        }

        // Get existing profile if any
        const existingProfile = await Mentor.findOne({ _id: req.user.userId });

        // If profile is already completed, redirect to mentor dashboard
        if (existingProfile && existingProfile.profileCompleted) {
            req.session.successMessage = "Your profile is already completed";
            return res.redirect('/mentor_dashboard');
        }

        // Prepare profile data for the template
        const profileData = existingProfile || {
            fieldOfInterest: mentor.fieldOfInterest || '',
            yearOfExperience: mentor.yearOfExperience || '',
            skills: mentor.skills || [],
            availability: mentor.availability || '',
            briefBio: mentor.briefBio || '',
            education: mentor.education || '',
            expertise: mentor.expertise || [],
            specializations: mentor.specializations || [],
            preferredTimeSlots: mentor.preferredTimeSlots || [],
            maxSessions: mentor.maxSessions || 5,
            sessionDuration: mentor.sessionDuration || 60
        };

        // Render the profile form with existing data if any
        res.render('mentor_after_profile', {
            user: mentor,
            profile: profileData,
            errorMessage: req.session.errorMessage,
            successMessage: req.session.successMessage
        });

        // Clear messages after rendering
        req.session.errorMessage = null;
        req.session.successMessage = null;
    } catch (error) {
        console.error('Error in mentor profile route:', error);
        req.session.errorMessage = "An error occurred while loading the profile page";
        res.redirect('/login');
    }
});

// Mentor after profile route
app.get('/mentor_after_profile', authenticateToken, async (req, res) => {
    try {
        // Check if user is authenticated and is a mentor
        if (!req.user || req.user.role !== 'mentor') {
            return res.redirect('/login');
        }

        // Get mentor data
        const mentor = await Mentor.findById(req.user.userId);
        if (!mentor) {
            req.session.errorMessage = "Mentor not found";
            return res.redirect('/login');
        }

        // Get existing profile if any
        const existingProfile = await Mentor.findOne({ _id: req.user.userId });

        // If profile is already completed, redirect to mentor dashboard
        if (existingProfile && existingProfile.profileCompleted) {
            req.session.successMessage = "Your profile is already completed";
            return res.redirect('/mentor_dashboard');
        }

        // Prepare profile data for the template
        const profileData = existingProfile || {
            fieldOfInterest: mentor.fieldOfInterest || '',
            yearOfExperience: mentor.yearOfExperience || '',
            skills: mentor.skills || [],
            availability: mentor.availability || '',
            briefBio: mentor.briefBio || '',
            education: mentor.education || '',
            expertise: mentor.expertise || [],
            specializations: mentor.specializations || [],
            preferredTimeSlots: mentor.preferredTimeSlots || [],
            maxSessions: mentor.maxSessions || 5,
            sessionDuration: mentor.sessionDuration || 60
        };

        // Render the profile form with existing data if any
        res.render('mentor_after_profile', {
            user: mentor,
            profile: profileData,
            errorMessage: req.session.errorMessage,
            successMessage: req.session.successMessage
        });

        // Clear messages after rendering
        req.session.errorMessage = null;
        req.session.successMessage = null;
    } catch (error) {
        console.error('Error in mentor after profile route:', error);
        req.session.errorMessage = "An error occurred while loading the profile page";
        res.redirect('/login');
    }
});

app.post('/submit_profile', authenticateToken, upload.single('uploadResume'), async (req, res) => {
    try {
        console.log('Received form data:', req.body);
        console.log('Received file:', req.file);

        // Check if user is authenticated and is a mentor
        if (!req.user || req.user.role !== 'mentor') {
            console.log('Unauthorized access attempt:', req.user);
            req.session.errorMessage = "Unauthorized access";
            return res.redirect('/login');
        }

        // Validate required fields
        if (!req.body.fieldOfInterest || !req.body.yearOfExperience || !req.body.skills || 
            !req.body.education || !req.body.expertise || !req.body.specializations || 
            !req.body.preferredTimeSlots || !req.body.maxSessions || !req.body.sessionDuration) {
            console.log('Missing required fields');
            req.session.errorMessage = "All required fields must be filled";
            return res.redirect('/mentor_after_profile');
        }

        // Check if resume was uploaded
        if (!req.file) {
            console.log('Resume not uploaded');
            req.session.errorMessage = "Resume upload is required";
            return res.redirect('/mentor_after_profile');
        }

        // Convert comma-separated strings to arrays
        const skillsArray = req.body.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        const expertiseArray = req.body.expertise.split(',').map(exp => exp.trim()).filter(exp => exp);
        const specializationsArray = req.body.specializations.split(',').map(spec => spec.trim()).filter(spec => spec);
        const timeSlotsArray = req.body.preferredTimeSlots.split(',').map(slot => slot.trim()).filter(slot => slot);

        // Validate arrays are not empty
        if (skillsArray.length === 0 || expertiseArray.length === 0 || 
            specializationsArray.length === 0 || timeSlotsArray.length === 0) {
            console.log('Empty arrays in profile data');
            req.session.errorMessage = "Please provide valid values for all fields";
            return res.redirect('/mentor_after_profile');
        }

        // Upload resume to Cloudinary
        let resumeUrl = '';
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    resource_type: 'raw',
                    folder: 'mentor_resumes'
                });
                resumeUrl = result.secure_url;
            console.log('Resume uploaded successfully:', resumeUrl);
            } catch (uploadError) {
                console.error('Error uploading to Cloudinary:', uploadError);
                req.session.errorMessage = "Failed to upload resume";
            return res.redirect('/mentor_after_profile');
        }

        const profileData = {
            fieldOfInterest: req.body.fieldOfInterest,
            yearOfExperience: parseInt(req.body.yearOfExperience),
                skills: skillsArray,
            availability: req.body.availability || "",
            briefBio: req.body.briefBio || "",
                uploadResume: resumeUrl,
            education: req.body.education,
                expertise: expertiseArray,
                specializations: specializationsArray,
                preferredTimeSlots: timeSlotsArray,
            maxSessions: parseInt(req.body.maxSessions),
            sessionDuration: parseInt(req.body.sessionDuration),
                isOnline: true,
            lastActive: new Date(),
            rating: 0,
            totalSessions: 0,
            profileCompleted: true
        };

        console.log('Updating mentor profile with data:', profileData);

        // Update mentor document
        const updatedMentor = await Mentor.findByIdAndUpdate(
            req.user.userId,
            profileData,
            { new: true, runValidators: true }
        );

        if (!updatedMentor) {
            console.log('Failed to update mentor document');
            req.session.errorMessage = "Failed to update mentor profile";
            return res.redirect('/mentor_after_profile');
        }

        console.log('Mentor profile updated successfully:', {
            id: updatedMentor._id,
            email: updatedMentor.email,
            profileCompleted: updatedMentor.profileCompleted
        });

        // Send profile data to mentor processor and wait for response
        try {
            const processorResponse = await axios.post('http://localhost:5003/process_mentor_profile', {
                mentor_id: updatedMentor._id,
                mentor_data: {
                    expertise: {
                        job_role: profileData.fieldOfInterest,
                        skills: profileData.skills,
                        education: profileData.education,
                        experience: profileData.yearOfExperience,
                        specializations: profileData.specializations
                    },
                    availability: {
                        available_hours: 8, // Default to 8 hours
                        preferred_time_slots: profileData.preferredTimeSlots,
                        timezone: "UTC" // Default timezone
                    },
                    workload: {
                        current_sessions: 0,
                        max_sessions: profileData.maxSessions,
                        session_duration: profileData.sessionDuration
                    },
                    basic_info: {
                        name: updatedMentor.name,
                        email: updatedMentor.email,
                        is_online: false,
                        last_active: new Date().toISOString()
                    },
                    location: {
                        country: "Unknown",
                        city: "Unknown",
                        timezone: "UTC"
                    }
                }
            });

            if (processorResponse.data.error) {
                console.error('Error in mentor processor:', processorResponse.data.error);
                req.session.errorMessage = "Error processing profile data";
                return res.redirect('/mentor_after_profile');
            }

            console.log('Profile processed successfully by mentor processor');

            // Verify the processed data
            const verifyResponse = await axios.get(`http://localhost:5003/get_mentor_dashboard/${updatedMentor._id}`);
            if (verifyResponse.data.error) {
                throw new Error(verifyResponse.data.error);
            }
            console.log('Processed data verified successfully');

        } catch (processorError) {
            console.error('Error with mentor processor:', processorError);
            req.session.errorMessage = "Error processing profile data";
            return res.redirect('/mentor_after_profile');
        }

        // Set success message and redirect to mentor dashboard
        req.session.successMessage = "Profile completed successfully!";
        return res.redirect('/mentor_dashboard');

    } catch (error) {
        console.error('Error saving mentor profile:', error);
        req.session.errorMessage = "Failed to create mentor profile. Please try again.";
        return res.redirect('/mentor_after_profile');
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

// API endpoint to check mentee request status
app.get('/api/mentee-request/:requestId', authenticateToken, async (req, res) => {
    try {
        const request = await MenteeRequest.findById(req.params.requestId)
            .populate('matchedMentorId', 'name expertise experience rating');
        
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        res.json({
            status: request.status,
            matchedMentor: request.matchedMentorId,
            compatibilityScore: request.compatibilityScore || 0
        });
    } catch (error) {
        console.error('Error fetching mentee request:', error);
        res.status(500).json({ error: 'Failed to fetch request status' });
    }
});

// Test route to create a complete mentor profile
app.get('/create-test-profile', async (req, res) => {
    try {
        // Find the test mentor
        const mentor = await Mentor.findOne({ email: 'testmentor@example.com' });
        if (!mentor) {
            console.log('Test mentor not found, creating new test mentor');
            // Create a new test mentor if not found
            const hashedPassword = await bcrypt.hash('test123', 10);
            const newMentor = new Mentor({
                name: 'Test Mentor',
                email: 'testmentor@example.com',
                password: hashedPassword,
                role: 'mentor',
                phone: '1234567890',
                address: 'Test Address'
            });
            mentor = await newMentor.save();
            console.log('Created new test mentor:', mentor._id);
        }

        console.log('Found/Created test mentor:', {
            id: mentor._id,
            email: mentor.email,
            profileCompleted: mentor.profileCompleted
        });

        const profileData = {
                fieldOfInterest: 'Software Engineering',
                yearOfExperience: 5,
                skills: ['JavaScript', 'Python', 'Node.js', 'React', 'MongoDB'],
                availability: 'Available 9 AM - 6 PM IST',
                briefBio: 'Experienced software engineer with expertise in full-stack development',
                education: 'B.Tech in Computer Science',
                expertise: ['Web Development', 'Database Design', 'API Development'],
                specializations: ['Full Stack Development', 'Cloud Computing'],
                preferredTimeSlots: ['Morning', 'Evening'],
                maxSessions: 5,
                sessionDuration: 60,
                isOnline: true,
                lastActive: new Date(),
                profileCompleted: true
        };

        console.log('Updating mentor with profile data:', profileData);

        // Update the mentor profile
        const updatedMentor = await Mentor.findByIdAndUpdate(
            mentor._id,
            {
                $set: {
                    ...profileData,
                    profileCompleted: true // Ensure this is explicitly set
                }
            },
            { 
                new: true,
                runValidators: true
            }
        );

        if (!updatedMentor) {
            console.log('Failed to update test mentor profile');
            return res.status(500).json({ error: 'Failed to update test mentor profile' });
        }

        console.log('Test mentor profile updated successfully:', {
            id: updatedMentor._id,
            email: updatedMentor.email,
            profileCompleted: updatedMentor.profileCompleted,
            fullProfile: JSON.stringify(updatedMentor)
        });

        // Verify the update
        const verifiedMentor = await Mentor.findById(mentor._id);
        console.log('Verified mentor profile:', {
            id: verifiedMentor._id,
            profileCompleted: verifiedMentor.profileCompleted,
            fullProfile: JSON.stringify(verifiedMentor)
        });

        // Send profile data to mentor processor
        try {
            await axios.post('http://localhost:5003/process_mentor_profile', {
                mentor_id: mentor._id,
                mentor_data: {
                    expertise: {
                        job_role: profileData.fieldOfInterest,
                        skills: profileData.skills,
                        education: profileData.education,
                        experience: profileData.yearOfExperience,
                        specializations: profileData.specializations
                    },
                    availability: {
                        available_hours: 8, // Default to 8 hours
                        preferred_time_slots: profileData.preferredTimeSlots,
                        timezone: "UTC" // Default timezone
                    },
                    workload: {
                        current_sessions: 0,
                        max_sessions: profileData.maxSessions,
                        session_duration: profileData.sessionDuration
                    },
                    basic_info: {
                        name: verifiedMentor.name,
                        email: verifiedMentor.email,
                        is_online: false,
                        last_active: new Date().toISOString()
                    },
                    location: {
                        country: "Unknown",
                        city: "Unknown",
                        timezone: "UTC"
                    }
                }
            });
            console.log('Test profile data sent to mentor processor successfully');
        } catch (processorError) {
            console.error('Error sending test profile data to mentor processor:', processorError);
            // Continue with the flow even if processor update fails
        }

        res.json({ 
            message: 'Test profile created/updated successfully', 
            mentorId: mentor._id,
            profileCompleted: verifiedMentor.profileCompleted,
            profile: verifiedMentor
        });
    } catch (error) {
        console.error('Error in create-test-profile:', error);
        res.status(500).json({ 
            error: 'Failed to create test profile',
            details: error.message
        });
    }
});

// Mentor profile completion route
app.post('/mentor_profile/complete', authenticateToken, upload.single('uploadResume'), async (req, res) => {
    try {
        // Validate user authentication and role
        if (!req.user || req.user.role !== 'mentor') {
            console.log('Unauthorized access attempt:', req.user);
            return res.redirect('/login');
        }

        const mentorId = req.user.userId;
        console.log('Processing profile completion for mentor:', mentorId);
        
        // Validate required fields
        if (!req.body.fieldOfInterest || !req.body.yearOfExperience || !req.body.skills || 
            !req.body.education || !req.body.expertise || !req.body.specializations || 
            !req.body.preferredTimeSlots || !req.body.maxSessions || !req.body.sessionDuration) {
            console.log('Missing required fields in profile completion');
            req.session.errorMessage = "All required fields must be filled";
            return res.redirect('/mentor_after_profile');
        }

        // Check if resume was uploaded
        if (!req.file) {
            console.log('Resume not uploaded');
            req.session.errorMessage = "Resume upload is required";
            return res.redirect('/mentor_after_profile');
        }

        // Process comma-separated strings into arrays with validation
        const skills = req.body.skills.split(',').map(skill => skill.trim()).filter(skill => skill);
        const expertise = req.body.expertise.split(',').map(exp => exp.trim()).filter(exp => exp);
        const specializations = req.body.specializations.split(',').map(spec => spec.trim()).filter(spec => spec);
        const preferredTimeSlots = req.body.preferredTimeSlots.split(',').map(slot => slot.trim()).filter(slot => slot);

        // Validate arrays are not empty
        if (skills.length === 0 || expertise.length === 0 || specializations.length === 0 || preferredTimeSlots.length === 0) {
            console.log('Empty arrays in profile data');
            req.session.errorMessage = "Please provide valid values for all fields";
            return res.redirect('/mentor_after_profile');
        }

        // Upload resume to Cloudinary
        let resumeUrl = '';
        try {
            const result = await cloudinary.uploader.upload(req.file.path, {
                resource_type: 'raw',
                folder: 'mentor_resumes'
            });
            resumeUrl = result.secure_url;
        } catch (uploadError) {
            console.error('Error uploading to Cloudinary:', uploadError);
            req.session.errorMessage = "Failed to upload resume";
            return res.redirect('/mentor_after_profile');
        }

        const profileData = {
            fieldOfInterest: req.body.fieldOfInterest,
            yearOfExperience: parseInt(req.body.yearOfExperience) || 0,
            skills,
            expertise,
            specializations,
            availability: req.body.availability || "",
            briefBio: req.body.briefBio || "",
            uploadResume: resumeUrl,
            profileCompleted: true,
            education: req.body.education,
            preferredTimeSlots,
            maxSessions: parseInt(req.body.maxSessions) || 1,
            sessionDuration: parseInt(req.body.sessionDuration) || 30,
            isOnline: true,
            lastActive: new Date(),
            rating: 0,
            totalSessions: 0
        };

        console.log('Updating mentor profile with data:', profileData);

        // Update mentor document with profile data
        const updatedMentor = await Mentor.findByIdAndUpdate(
            mentorId,
            profileData,
            { new: true }
        );

        if (!updatedMentor) {
            console.log('Failed to update mentor document');
            req.session.errorMessage = "Failed to update mentor profile";
            return res.redirect('/mentor_after_profile');
        }

        console.log('Mentor profile updated successfully:', {
            mentorId: updatedMentor._id,
            profileCompleted: updatedMentor.profileCompleted
        });

        // Send profile data to mentor processor and wait for response
        try {
            const processorResponse = await axios.post('http://localhost:5003/process_mentor_profile', {
                mentor_id: mentorId,
                mentor_data: {
                    expertise: {
                        job_role: profileData.fieldOfInterest,
                        skills: profileData.skills,
                        education: profileData.education,
                        experience: profileData.yearOfExperience,
                        specializations: profileData.specializations
                    },
                    availability: {
                        available_hours: 8, // Default to 8 hours
                        preferred_time_slots: profileData.preferredTimeSlots,
                        timezone: "UTC" // Default timezone
                    },
                    workload: {
                        current_sessions: 0,
                        max_sessions: profileData.maxSessions,
                        session_duration: profileData.sessionDuration
                    },
                    basic_info: {
                        name: updatedMentor.name,
                        email: updatedMentor.email,
                        is_online: false,
                        last_active: new Date().toISOString()
                    },
                    location: {
                        country: "Unknown",
                        city: "Unknown",
                        timezone: "UTC"
                    }
                }
            });
            
            if (processorResponse.data.error) {
                console.error('Error in mentor processor:', processorResponse.data.error);
                req.session.errorMessage = "Error processing profile data";
                return res.redirect('/mentor_after_profile');
            }
            
            console.log('Profile data processed successfully by mentor processor');
        } catch (processorError) {
            console.error('Error sending data to mentor processor:', processorError);
            req.session.errorMessage = "Error processing profile data";
            return res.redirect('/mentor_after_profile');
        }

        // Set success message in session
        req.session.successMessage = 'Profile completed successfully!';
        
        // Redirect to mentor dashboard with success message
        return res.redirect('/mentor_dashboard');
    } catch (error) {
        console.error('Error in mentor profile completion:', error);
        req.session.errorMessage = "An error occurred while completing your profile";
        return res.redirect('/mentor_after_profile');
    }
});

// Mentor matching route
// POST route runs algo.py and redirects
// Find Mentee Route (No Authentication)
app.post('/find-mentee', (req, res) => {
    const mentorId = req.user.userId; // Get from session

    const pythonProcess = spawn('python3', ['algo.py', mentorId]);
    let output = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
        try {
            // Handle all errors in the same way
            let errorMessage = null;
            
            if (code !== 0) {
                errorMessage = "algorithm_failed";
            } else {
                const result = JSON.parse(output);
                
                if (!result.success) {
                    errorMessage = result.error || "algorithm_error";
                } else if (!result.matches || result.matches.length === 0) {
                    errorMessage = "no_matches_found";
                }
            }

            if (errorMessage) {
                return res.redirect(`/matching_interface?error=${encodeURIComponent(errorMessage)}`);
            }

            // Process successful matches
            const result = JSON.parse(output);
            const menteeIds = result.matches.map(m => m.mentee_id);
            const mentees = await User.find({ '_id': { $in: menteeIds } });

            const matchesWithDetails = result.matches.map(match => ({
                ...match,
                mentee: mentees.find(m => m._id.toString() === match.mentee_id)
            }));

            res.render('matching_interface', {
                isMentor: true,
                matchedMentees: matchesWithDetails,
                errorMessage: null,
                user: req.user
            });

        } catch (error) {
            console.error('Final error handler:', error);
            res.redirect(`/matching_interface?error=${encodeURIComponent('processing_error')}`);
        }
    });
});
// Background process to fetch matches
async function fetchMatchesInBackground(mentorId) {
    try {
        // Check if ALGO_SERVICE_URL is defined
        if (!process.env.ALGO_SERVICE_URL) {
            console.error("ALGO_SERVICE_URL environment variable is not defined");
            return;
        }

        console.log(`Calling matching service at: ${process.env.ALGO_SERVICE_URL}/get_mentor_matching_interface/${mentorId}`);
        
        // Call algo.py service to get matched mentees
        const response = await axios.get(`${process.env.ALGO_SERVICE_URL}/get_mentor_matching_interface/${mentorId}`);
        
        if (response.data.error) {
            console.error("Error from matching service:", response.data.error);
            return;
        }

        // Check if matches exist in the response
        if (!response.data.matches || !Array.isArray(response.data.matches)) {
            console.error("Invalid response format from matching service:", response.data);
            return;
        }

        const matchedMentees = response.data.matches.map(match => ({
            _id: match.mentee_id,
            name: match.mentee_details.name,
            email: match.mentee_details.email,
            skills: match.mentee_details.skills || [],
            education: match.mentee_details.education || "Not specified",
            compatibility_score: match.compatibility_score || 0.5,
            matching_subject: match.mentee_details.matching_subject || "General",
            matching_percentage: match.mentee_details.matching_percentage || 0.5
        }));

        // Store matches in session for retrieval
        global.matchesCache = global.matchesCache || {};
        global.matchesCache[mentorId] = {
            matches: matchedMentees,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error("Error fetching matches in background:", error);
    }
}

// API endpoint to get matches
app.get('/api/matches', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "mentor") {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const mentorId = req.session.user._id;
        const cachedMatches = global.matchesCache?.[mentorId];

        if (cachedMatches && Date.now() - cachedMatches.timestamp < 5 * 60 * 1000) { // 5 minutes cache
            return res.json({ matches: cachedMatches.matches });
        }

        // If no cached matches or cache expired, trigger a new fetch
        fetchMatchesInBackground(mentorId);
        res.json({ matches: [], message: "Fetching matches..." });

    } catch (error) {
        console.error("Error in matches API:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Mentee profile view route
app.get('/mentor/mentee/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user is authenticated and is a mentor
        if (!req.user || req.user.role !== 'mentor') {
            return res.redirect('/login');
        }

        // Find the mentee
        const mentee = await Mentee.findById(req.params.id);
        if (!mentee) {
            req.session.errorMessage = "Mentee not found";
            return res.redirect('/mentor/matching');
        }

        // Render the mentee profile
        res.render('mentee_profile_view', {
            user: req.user,
            mentee: mentee
        });
    } catch (error) {
        console.error('Error viewing mentee profile:', error);
        req.session.errorMessage = "An error occurred while loading the mentee profile";
        res.redirect('/mentor/matching');
    }
});

// Update mentee profile route
app.post('/update-student-profile', authenticateToken, async (req, res) => {
    try {
        console.log('Update mentee profile route accessed:', {
            user: req.user,
            body: req.body
        });
        
        // Check if user is authenticated and is a mentee
        if (!req.user || req.user.role !== 'mentee') {
            console.log('User not authenticated or not a mentee:', req.user);
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Get mentee data
        const mentee = await User.findById(req.user.userId);
        console.log('Mentee found:', mentee ? {
            id: mentee._id,
            email: mentee.email,
            name: mentee.name
        } : 'No');
        
        if (!mentee) {
            console.log('Mentee not found in database');
            return res.status(404).json({ success: false, error: 'Mentee not found' });
        }

        // Update mentee data
        const { name, phone, address } = req.body;
        
        // Only update fields that are provided
        if (name && name.trim() !== '') mentee.name = name;
        if (phone && phone.trim() !== '') mentee.phone = phone;
        if (address && address.trim() !== '') mentee.address = address;
        
        // Save changes
        await mentee.save();
        
        console.log('Mentee profile updated successfully:', {
            id: mentee._id,
            name: mentee.name,
            phone: mentee.phone,
            address: mentee.address
        });
        
        return res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating mentee profile:', error);
        return res.status(500).json({ success: false, error: 'An error occurred while updating the profile' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error details:', err);
    console.error('Error stack:', err.stack);
    
    // Check if headers have already been sent
    if (res.headersSent) {
        return next(err);
    }
    
    // Render error page with details
    res.status(500).render('error', { 
        message: "An error occurred while processing your request",
        error: process.env.NODE_ENV === 'development' ? err.message : null,
        stack: process.env.NODE_ENV === 'development' ? err.stack : null
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
initializeApp().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
});

// Add error handling for Python service failures
app.use(async (req, res, next) => {
    // Check if the request requires Python services
    if (req.path.startsWith('/api/') || 
        req.path.includes('mentor') || 
        req.path.includes('doubt') ||
        req.path.includes('workflow')) {
        
        try {
            // Determine which service to check based on the request path
            let servicePort;
            let serviceName;
            
            if (req.path.includes('doubt')) {
                servicePort = 5001;
                serviceName = 'API';
            } else if (req.path.includes('match')) {
                servicePort = 5000;
                serviceName = 'Algorithm';
            } else if (req.path.includes('workflow')) {
                servicePort = 5002;
                serviceName = 'Workflow';
            } else {
                servicePort = 5003;
                serviceName = 'Mentor Processor';
            }
            
            // Check service health with retry logic
            let healthResponse = null;
            let retries = 3;
            let lastError = null;
            
            while (retries > 0) {
                try {
                    healthResponse = await axios.get(`http://localhost:${servicePort}/health`, {
                        timeout: 5000
                    });
                    break;
                } catch (error) {
                    lastError = error;
                    retries--;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            if (!healthResponse) {
                throw lastError || new Error('Service health check failed after retries');
            }
            
            // If service is unhealthy, return error
            if (healthResponse.data.status !== 'healthy') {
                return res.status(503).json({
                    error: 'Service temporarily unavailable',
                    message: `The ${serviceName} service is not healthy. Please try again later.`,
                    details: healthResponse.data
                });
            }
            
            // If workflow service is involved, check its dependencies
            if (req.path.includes('workflow')) {
                // Check mentor processor health
                const mentorProcessorHealth = await axios.get('http://localhost:5003/health', {
                    timeout: 5000
                }).catch(() => null);
                
                if (!mentorProcessorHealth || mentorProcessorHealth.data.status !== 'healthy') {
                    return res.status(503).json({
                        error: 'Service dependency unavailable',
                        message: 'The Mentor Processor service is not healthy. Workflow service cannot function properly.',
                        details: mentorProcessorHealth?.data
                    });
                }
                
                // Check API service health
                const apiHealth = await axios.get('http://localhost:5001/health', {
                    timeout: 5000
                }).catch(() => null);
                
                if (!apiHealth || apiHealth.data.status !== 'healthy') {
                    return res.status(503).json({
                        error: 'Service dependency unavailable',
                        message: 'The API service is not healthy. Workflow service cannot function properly.',
                        details: apiHealth?.data
                    });
                }
            }
            
            next();
        } catch (error) {
            console.error(`Service health check failed: ${error.message}`);
            return res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'The required service is not running or not responding. Please try again later.',
                details: error.message
            });
        }
    } else {
        next();
    }
});