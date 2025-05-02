// server/server.js

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
const { authenticateUser, adminOnly } = require('./middleware/auth');
const googleSheetsService = require('./services/googleSheetsService');
const googleDriveService = require('./services/googleDriveService');

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

// Body parser middleware with increased limit for large requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware - simplified without queue endpoints
app.use((req, res, next) => {
  if (req.method === 'POST' || req.url.includes('admin') || req.url.includes('submit')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// API routes
app.use('/api/erc-protest', ercProtestRouter);
app.use('/api/erc-protest/admin', authenticateUser, adminOnly, adminRouter);
app.use('/api/erc-protest/chatgpt', chatgptScraperRouter);

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
    }
    console.log('Directory structure initialized');
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Initialize services
async function initializeServices() {
  try {
    // Initialize Google Sheets
    await googleSheetsService.initialize();
    
    // Initialize Google Drive
    await googleDriveService.initialize();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
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

// Start the server with increased timeout
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT} in ${isProduction ? 'production' : 'development'} mode`);
  
  // Set timeout to 30 minutes for long-running connections
  server.timeout = 1800000;
  
  // Also increase header and body parser timeouts
  server.headersTimeout = 1805000; // 30 min + 5 sec
  server.keepAliveTimeout = 1810000; // 30 min + 10 sec
  
  console.log(`Server timeout set to ${server.timeout}ms (${server.timeout/60000} minutes)`);
  
  await createDirectories();
  await initializeServices();
});

// End