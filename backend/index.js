const app = require('./app');
const dotenv = require('dotenv');

dotenv.config();

const port = process.env.PORT || 4000;

// Start the server only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;