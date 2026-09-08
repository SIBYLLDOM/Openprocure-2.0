const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { generateCaptcha, verifyCaptcha } = require('../utils/captcha');
const COMPANY_TYPES = require('../config/companyTypes');
require('dotenv').config();

// At least 8 characters, one uppercase, one lowercase, one digit, one
// special character — enforced here (not just in the frontend's checklist),
// since the frontend check alone is trivially bypassable via a direct API call.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '90d' }
  );
};

// @route  GET /api/auth/company-types
// Canonical list for the partner registration form's Step 2 checkboxes.
exports.getCompanyTypes = (_req, res) => {
  res.status(200).json(COMPANY_TYPES);
};

// @route  GET /api/auth/captcha
// Issues a fresh math-captcha challenge for the partner registration flow.
exports.getCaptcha = (_req, res) => {
  res.status(200).json(generateCaptcha());
};

// @route  POST /api/auth/register-partner
// Public self-service signup for the OEM/Reseller pricing cards — a single
// flow for both (see components/blocks/pricing-section.tsx), distinguished
// by which industry vertical(s) the company selects (companyTypes) and
// which pricing card it started from (partnerType). Deliberately does NOT
// auto-login — the applicant is sent to /login to sign in with the
// credentials they just set, per how this was asked for.
exports.registerPartner = async (req, res) => {
  try {
    const { name, email, companyTypes, password, confirmPassword, captchaToken, captchaAnswer, partnerType } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    if (!['oem', 'reseller'].includes(partnerType)) {
      return res.status(400).json({ message: 'partnerType must be oem or reseller' });
    }

    // Values don't have to be from COMPANY_TYPES — the frontend's "Other"
    // field lets a company type in a vertical that isn't in the fixed list
    // at all (see PartnerRegisterPage.tsx), so this only guards against
    // empty/garbage entries, not membership in the canonical list.
    const types = Array.isArray(companyTypes) ? companyTypes.map((t) => String(t).trim()).filter(Boolean) : [];
    if (types.length === 0) {
      return res.status(400).json({ message: 'Select at least one company type, or type your own' });
    }
    const tooLong = types.find((t) => t.length > 100);
    if (tooLong) {
      return res.status(400).json({ message: 'Company type must be under 100 characters' });
    }

    if (!password || !PASSWORD_RULE.test(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (!captchaToken || captchaAnswer === undefined || captchaAnswer === '') {
      return res.status(400).json({ message: 'Please answer the captcha' });
    }
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ message: 'Incorrect captcha answer — please try again' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email is already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      name,
      email,
      password: hashedPassword,
      userType: 'partner',
      partnerType,
      companyTypes: JSON.stringify(types)
    });

    res.status(201).json({ message: 'Account created — you can now sign in.' });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// @route  POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        partnerType: user.partnerType,
        companyTypes: user.companyTypes ? JSON.parse(user.companyTypes) : null,
        profileSubmitted: user.profileSubmitted,
        photoUrl: null
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// @route  GET /api/auth/me
// @route  PATCH /api/auth/company-types
// Lets a partner add/remove business categories after registration (Setup
// Profile > Company Information). Validated against the same canonical
// list as signup so this can't smuggle in an arbitrary string either.
// Products & Categories (Step 4) reads User.companyTypes fresh on every
// request (see productMasterController.getMyCategories), so it reflects
// this change immediately with no separate sync step needed.
exports.updateCompanyTypes = async (req, res) => {
  try {
    const { companyTypes } = req.body;
    const types = Array.isArray(companyTypes) ? companyTypes.map((t) => String(t).trim()).filter(Boolean) : [];
    const invalid = types.filter((t) => !COMPANY_TYPES.includes(t));
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Invalid categories: ${invalid.join(', ')}` });
    }
    if (types.length === 0) {
      return res.status(400).json({ message: 'Select at least one business category.' });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.companyTypes = JSON.stringify(types);
    await user.save();
    res.status(200).json({ companyTypes: types });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update business categories', error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const json = user.toJSON();
    res.status(200).json({ ...json, companyTypes: json.companyTypes ? JSON.parse(json.companyTypes) : null, photoUrl: null });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};
