const { login } = require('../services/auth.service');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const data = await login(email, password, rememberMe);
    res.json(data);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

/* Forgot password (mock for now) */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Later: send email with token
  res.json({
    message: 'Password reset instructions sent to email'
  });
};

/* Register new user */
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if email already exists
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword, role });

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};


module.exports = {
  loginUser,
  forgotPassword,
  registerUser
};