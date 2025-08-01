const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3001;

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
