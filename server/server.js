// server/server.js (updated)

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const morgan = require('morgan');
const fs = require('fs').promises;
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

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false  // Disable CSP for development
}));
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('dev'));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../client/build')));

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
      console.log(`Created directory: ${dir}`);
    }
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Initialize Google Sheets service
async function initializeServices() {
  try {
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

// COMMENTED OUT: Front-end catch-all route to prevent 404 errors during testing
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
// });

// Add a more helpful 404 handler instead
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found. If you need React routes, build the client first with: cd client && npm run build'
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await createDirectories();
  await initializeServices();
  console.log(`API endpoints:
  - /api/erc-protest
  - /api/erc-protest/admin
  - /api/erc-protest/chatgpt
  - /api/debug`);
});