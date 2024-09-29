const express = require('express');
const router = express.Router();
const { 
  createPayment, 
  verifyPayment, 
  paymentRefund, 
  getAllOrders, 
  getAllUserData, 
  webhook 
} = require('../controllers/paymentMethod');

// Define routes
router.post('/create-order', createPayment);
router.post('/verify-payment', verifyPayment);
router.post('/refund', paymentRefund);
router.get('/get-all-orders', getAllOrders);
router.get('/get-all-user-data', getAllUserData);
router.post('/webhook', webhook);

module.exports = router;
