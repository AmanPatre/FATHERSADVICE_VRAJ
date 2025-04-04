// middleware/auth.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here'; // Should be in env vars

const authenticateToken = (req, res, next) => {
    try {
        console.log('Authentication middleware called for path:', req.path);
        console.log('Session data:', req.session);
        console.log('Cookies:', req.cookies);
        
        // Get token from cookie
        const token = req.cookies.token;
        console.log('Token from cookie:', token ? 'Present' : 'Missing');

        if (!token) {
            console.log('No token found, redirecting to login');
            // Clear session and redirect to login
            if (req.session) {
                req.session.destroy(() => {
                    res.clearCookie('token');
                    return res.redirect(`/login?error=${encodeURIComponent('Please log in to continue')}`);
                });
            } else {
                res.clearCookie('token');
                return res.redirect(`/login?error=${encodeURIComponent('Please log in to continue')}`);
            }
            return;
        }

        // Verify token
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                console.log('Token verification failed:', err.message);
                // Clear session and token on verification failure
                if (req.session) {
                    req.session.destroy(() => {
                        res.clearCookie('token');
                        return res.redirect(`/login?error=${encodeURIComponent('Session expired. Please log in again')}`);
                    });
                } else {
                    res.clearCookie('token');
                    return res.redirect(`/login?error=${encodeURIComponent('Session expired. Please log in again')}`);
                }
                return;
            }

            console.log('Token verified successfully:', decoded);
            // Set user info in request
            req.user = decoded;
            next();
        });
    } catch (error) {
        console.error('Authentication middleware error:', error);
        res.clearCookie('token');
        return res.redirect(`/login?error=${encodeURIComponent('Authentication error. Please log in again')}`);
    }
};

module.exports = { authenticateToken };

