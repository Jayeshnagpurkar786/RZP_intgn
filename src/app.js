import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import axios from "axios";
import { pool } from "./models/database.js"; // Ensure the file extension is included
import { createPayment, verifyPayment, paymentRefund, getAllOrders, getAllUserData, webhook } from './controllers/paymentMethod.js';

dotenv.config(); // Load environment variables

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({ status: "Ok", message: "API is running successfully" });
});

// Middleware to capture raw body for webhook requests
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));

// Payment method via webhook
app.post('/webhook', async (req, res) => {
  const razorpayPayload = req.body;
  const { event, payload: { payment: { entity } } } = razorpayPayload;

  const { id: payment_id, amount, currency, status, order_id, description, email, contact } = entity;

  const existingLogResult = await pool.query(
    `SELECT * FROM rzp_payments WHERE payment_id = $1`,
    [payment_id]
  );

  if (existingLogResult.rowCount > 0) {
    if (existingLogResult.rows[0].status !== "paid") {
      await pool.query(
        `UPDATE rzp_payments SET status = $1 WHERE payment_id = $2`,
        ["paid", payment_id]
      );
    } else {
      return res.status(200).json({ status: "success", message: "Payment already captured" });
    }
  } else {
    await pool.query(
      `INSERT INTO rzp_payments (order_id, amount, currency, status, payment_id, description, email, contact) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [order_id, amount, currency, status, payment_id, description, email, contact]
    );
  }

  if (status === "captured" && event === "payment.captured") {
    return res.status(200).json({ status: "success", message: "Payment processed successfully" });
  } else {
    return res.status(200).json({ status: "success", message: "Already Captured Payment" });
  }
});

// Create Payment
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    const queryText = `INSERT INTO orders (order_id, amount, currency, receipt, status) 
                       VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const values = [order.id, amount, order.currency, order.receipt, "created"];
    await pool.query(queryText, values);

    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Failed to create Razorpay order", details: error.message });
  }
});

// Verify Payment
app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ status: "error", message: "Missing required parameters" });
  }

  try {
    const queryText = `UPDATE orders SET status = $1, payment_id = $2 WHERE order_id = $3 RETURNING *`;
    const values = ["paid", razorpay_payment_id, razorpay_order_id];
    const dbRes = await pool.query(queryText, values);

    if (dbRes.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Order not found" });
    }

    return res.status(200).json({ status: "ok", data: dbRes.rows[0] });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Error verifying payment", details: error.message });
  }
});

// Refund Payment
async function refundPayment(paymentId, amount) {
  try {
    const response = await axios.post(
      'https://api.razorpay.com/v1/refunds',
      { payment_id: paymentId, amount: amount * 100 },
      {
        auth: {
          username: process.env.RAZORPAY_KEY_ID,
          password: process.env.RAZORPAY_KEY_SECRET,
        },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const refundQueryText = `INSERT INTO refund (refund_id, amount, currency, payment_id, status, created_at) 
                             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const refundValues = [
      response.data.id,
      response.data.amount / 100,
      response.data.currency,
      response.data.payment_id,
      response.data.status,
      new Date(response.data.created_at * 1000),
    ];
    await pool.query(refundQueryText, refundValues);

    return response.data;
  } catch (error) {
    console.error('Error initiating refund:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Payment Refund Endpoint
app.post('/api/refund', async (req, res) => {
  const { paymentId, amount } = req.body;
  if (!paymentId || !amount) {
    return res.status(400).json({ message: 'Payment ID and amount are required' });
  }

  try {
    const refund = await refundPayment(paymentId, amount);
    return res.status(200).json({ message: 'Refund initiated successfully', refund });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to initiate refund', error: error.message });
  }
});

// Fetch All Orders
app.get('/api/get-all-orders', async (req, res) => {
  try {
    const queryText = 'SELECT * FROM orders ORDER BY id DESC';
    const dbRes = await pool.query(queryText);

    return res.status(200).json({ success: true, data: dbRes.rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// Fetch All User Data
app.get('/api/get-all-user-data', async (req, res) => {
  try {
    const queryText = 'SELECT order_id, amount, currency, status, payment_id FROM rzp_payments ORDER BY order_id DESC';
    const dbRes = await pool.query(queryText);

    if (dbRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No user data found' });
    }

    return res.status(200).json({ success: true, data: dbRes.rows });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch user data', details: error.message });
  }
});

// Catch-all route for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
};

app.use(errorHandler); // Use the error handler middleware

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
