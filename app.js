const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const favicon = require('serve-favicon');
const routes = require('./routes/routes');

// Load environment variables
dotenv.config();

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

// Routes
const route = require("./routes/routes"); // Ensure your routes are defined correctly in routes.js
app.use("/api", route); // This will prefix all routes in routes.js with /api

// Health check route for checking if API is up
app.get("/api", (req, res) => {
  res.status(200).json({ status: "Ok", message: "API is running successfully" });
});

// Middleware to capture raw body for webhook requests
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));

// Catch-all route for unknown routes should be at the end
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

// Export the app for testing or further use
module.exports = app;
