const path = require('path');
const dotenv = require('dotenv');

// Clear any existing environment variables we want to control
delete process.env.OPENAI_API_KEY;
console.log(process.env.EMBEDDING_SERVICE_URL);
// Load environment variables from .env file
const result = dotenv.config({ 
    path: path.join(__dirname, '..', '.env'),
    override: true  // Override any existing env vars
});

if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

const app = require('./app');
const connectDB = require('./config/db');

// Expected API key

// Check if API key matches expected value
    console.log('Current API Key:', process.env.OPENAI_API_KEY);
    // Override with correct key

// Check critical environment variables
const requiredEnvVars = ['OPENAI_API_KEY', 'MONGODB_URI', 'EMBEDDING_SERVICE_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

const PORT = process.env.PORT || 3001;
// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
