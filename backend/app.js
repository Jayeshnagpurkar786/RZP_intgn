const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

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
const route = require("./routes/routes");
app.use("/api", route);

// Health check route for checking if API is up
app.get("/api", (req, res) => {
  res.status(200).json({ status: "Ok", message: "API is running successfully" });
});

// Catch-all route for unknown routes
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
};

// Middleware to capture raw body for webhook requests
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));

app.use(errorHandler);

module.exports = app;
