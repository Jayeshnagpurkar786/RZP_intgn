const { pool } = require("../models/database");

// Handles Razorpay payment method via webhook
async function paymentMethodHandler(req, res) {
  try {
    const razorpayPayload = req.body;
    const { event, payload: { payment: { entity } } } = razorpayPayload;

    const { id: payment_id, amount, currency, status, order_id, description, email, contact } = entity;

    // Check for existing order in the rzp_payments table
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
      // Insert new order into the rzp_payments table
      await pool.query(
        `INSERT INTO rzp_payments 
          (order_id, amount, currency, status, payment_id, description, email, contact) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order_id, amount, currency, status, payment_id, description, email, contact]
      );
    }

    if (status === "captured" && event === "payment.captured") {
      return res.status(200).json({ status: "success", message: "Payment processed successfully" });
    } else {
      return res.status(200).json({ status: "success", message: "Already Captured Payment" });
    }
  } catch (error) {
    console.error(`Error processing Razorpay webhook: ${error.message}`);
    return res.status(500).json({ status: "error", error: "Internal Server Error" });
  }
}

// Fetch captured payment data for user
async function getUserData(req, res) {
  try {
    const existingLogResult = await pool.query(
      `SELECT order_id, amount, email, contact FROM rzp_payments WHERE status = 'paid'`
    );

    if (existingLogResult.rowCount > 0) {
      res.status(200).json({ success: true, data: existingLogResult.rows });
    } else {
      res.status(404).json({ success: false, message: "No captured payments found" });
    }
  } catch (error) {
    console.error("Error fetching user data:", error.message);
    res.status(500).json({ success: false, message: "An error occurred while fetching user data", error: error.message });
  }
}

module.exports = {
  paymentMethodHandler,
  getUserData,
};
