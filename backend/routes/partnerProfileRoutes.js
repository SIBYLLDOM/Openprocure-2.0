const express = require('express');
const router = express.Router();
const {
  getProfile, updateSection, uploadLogo,
  createContact, updateContact, deleteContact,
  createLocation, updateLocation, deleteLocation,
  createTaxRegistration, updateTaxRegistration, deleteTaxRegistration,
  createCertificate, updateCertificate, deleteCertificate,
  setProducts, submitProfile
} = require('../controllers/partnerProfileController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.get('/', getProfile);
router.patch('/', updateSection);
router.post('/logo', upload.single('logo'), uploadLogo);

router.post('/contacts', createContact);
router.patch('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

router.post('/locations', createLocation);
router.patch('/locations/:id', updateLocation);
router.delete('/locations/:id', deleteLocation);

router.post('/tax-registrations', upload.single('document'), createTaxRegistration);
router.patch('/tax-registrations/:id', upload.single('document'), updateTaxRegistration);
router.delete('/tax-registrations/:id', deleteTaxRegistration);

router.post('/certificates', upload.single('document'), createCertificate);
router.patch('/certificates/:id', upload.single('document'), updateCertificate);
router.delete('/certificates/:id', deleteCertificate);

router.put('/products', setProducts);
router.post('/submit', submitProfile);

module.exports = router;
