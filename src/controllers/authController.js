const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Signup controller
const signup = async (req, res) => {
  try {
    // Get user input
    const { firstName, lastName, username, password } = req.body;

    // Validate user input
    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({
        message: 'All fields are required (firstName, lastName, username, password)'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        message: 'Username already exists'
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      username,
      password
    });

    // Save user to database
    await user.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      message: 'Error creating user'
    });
  }
};

// Login controller
const login = async (req, res) => {
  try {
    // Get user input
    const { username, password } = req.body;

    // Validate user input
    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required'
      });
    }

    // Find user in database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid username or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid username or password'
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Send response
    res.json({
      message: 'Login successful',
      token,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Error during login'
    });
  }
};

module.exports = {
  signup,
  login
}; 