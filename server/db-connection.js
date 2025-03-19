// db-connection.js - Updated with reduced logging
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string from .env file
const MONGODB_URI = process.env.MONGODB_URI;

// Track connection status
let isConnected = false;
let connectionAttempted = false;
// Add flag to prevent repeated logging
let loggingEnabled = false; // Changed to false to disable most logging

// Define a proper schema with all necessary fields
const submissionSchema = new mongoose.Schema({
  submissionId: String,
  businessName: String,
  ein: String,
  location: String,
  businessWebsite: String,
  naicsCode: String,
  status: String,
  receivedAt: { type: Date, default: Date.now },
  // Root level fields for backward compatibility
  processedQuarters: [String],
  // Nested structure for all submission data
  submissionData: {
    originalData: {
      formData: mongoose.Schema.Types.Mixed
    },
    processedQuarters: [String],
    quarterZips: mongoose.Schema.Types.Mixed,
    report: {
      generated: Boolean,
      path: String,
      qualificationData: {
        qualifyingQuarters: [String],
        quarterAnalysis: [mongoose.Schema.Types.Mixed]
      }
    }
  }
});

// Connect to MongoDB
const connectToDatabase = async () => {
  try {
    // Skip repeated logging for connection checks
    if (loggingEnabled === false) {
      // Silent check - if already connected, just return
      if (isConnected) {
        return true;
      }
    }
    
    if (!MONGODB_URI) {
      console.error('ERROR: No MongoDB URI provided in environment variables');
      return false;
    }

    if (isConnected) {
      return true;
    }

    if (connectionAttempted) {
      // Don't log this repeatedly
      return false;
    }

    connectionAttempted = true;
    console.log(`Connecting to MongoDB...`);
    
    // Add timeout and more detailed options
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000, // 15 seconds
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000
    });
    
    isConnected = true;
    console.log('Connected to MongoDB successfully');
    
    return true;
  } catch (error) {
    console.error('Error connecting to MongoDB:');
    console.error('- Message:', error.message);
    isConnected = false;
    return false;
  }
};

// Create the model
const Submission = mongoose.model('Submission', submissionSchema);

module.exports = {
  connectToDatabase,
  Submission,
  isConnected: () => isConnected
};