// server/server.js (updated for production & development)

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const morgan = require('morgan');
const fs = require('fs').promises;
const fsSync = require('fs');
const ercProtestRouter = require('./routes/erc-protest');
const adminRouter = require('./routes/admin');
const chatgptScraperRouter = require('./routes/chatgpt-scraper');
const mongodbQueueRouter = require('./routes/mongodb-queue'); // MongoDB queue router
const { authenticateUser, adminOnly } = require('./middleware/auth');
const googleSheetsService = require('./services/googleSheetsService');
const googleDriveService = require('./services/googleDriveService');
const { connectToDatabase } = require('./db-connection'); // Import database connection

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Handle Google credentials from environment variable if provided
if (process.env.GOOGLE_CREDENTIALS) {
  try {
    const credentialsDir = path.join(__dirname, 'config');
    if (!fsSync.existsSync(credentialsDir)) {
      fsSync.mkdirSync(credentialsDir, { recursive: true });
    }
    fsSync.writeFileSync(
      path.join(credentialsDir, 'google-credentials.json'),
      process.env.GOOGLE_CREDENTIALS
    );
    console.log('Google credentials written from environment variable');
  } catch (error) {
    console.error('Error writing Google credentials file:', error);
  }
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false  // Disable CSP for development
}));
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Modified logging middleware to silence MongoDB queue polling
app.use((req, res, next) => {
  // Skip logging for MongoDB queue endpoint to reduce console noise
  if (req.url.startsWith('/api/mongodb-queue') && req.method === 'GET') {
    return next();
  }
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API routes
app.use('/api/erc-protest', ercProtestRouter);
app.use('/api/erc-protest/admin', authenticateUser, adminOnly, adminRouter);
app.use('/api/erc-protest/chatgpt', chatgptScraperRouter);
app.use('/api/mongodb-queue', mongodbQueueRouter); // MongoDB queue router

// Debug route to check if the server is working
app.get('/api/debug', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Create necessary directories
async function createDirectories() {
  try {
    const directories = [
      path.join(__dirname, 'uploads/temp'),
      path.join(__dirname, 'data/ERC_Disallowances'),
      path.join(__dirname, 'data/ChatGPT_Conversations'),
      path.join(__dirname, 'config')
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Initialize services
async function initializeServices() {
  try {
    // Initialize MongoDB connection
    console.log('Connecting to MongoDB...');
    const mongoConnected = await connectToDatabase();
    if (mongoConnected) {
      console.log('MongoDB connected successfully');
    } else {
      console.log('MongoDB connection failed');
    }

    // Initialize Google Sheets
    await googleSheetsService.initialize();
    console.log('Google Sheets service initialized successfully');
    
    // Initialize Google Drive
    await googleDriveService.initialize();
    console.log('Google Drive service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    console.log('Make sure you have a valid google-credentials.json file in the config directory');
    console.log('The app will continue, but some services may not work');
  }
}

// Serve static files in production
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  // Serve static files from React build
  app.use(express.static(path.join(__dirname, '../client/build')));

  // For any other request, send back React's index.html file
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  // Dev environment - provide a more helpful 404 for API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        success: false,
        message: 'API route not found'
      });
    }
    next();
  });
}

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT} in ${isProduction ? 'production' : 'development'} mode`);
  await createDirectories();
  await initializeServices();
  console.log(`API endpoints:
  - /api/erc-protest
  - /api/erc-protest/admin
  - /api/erc-protest/chatgpt
  - /api/mongodb-queue
  - /api/debug`);
});