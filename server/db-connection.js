// server/db-connection.js
const mongoose = require('mongoose');

// MongoDB connection URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI;

// Track connection status
let isConnected = false;

// Submission schema
const submissionSchema = new mongoose.Schema({
  submissionId: {
    type: String,
    required: true,
    unique: true
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  originalData: {
    type: Object
  },
  receivedFiles: [{
    originalName: String,
    savedPath: String,
    mimetype: String,
    size: Number
  }],
  status: {
    type: String,
    enum: ['waiting', 'processing', 'complete', 'error'],
    default: 'waiting'
  },
  report: {
    generated: {
      type: Boolean,
      default: false
    },
    path: String,
    generatedAt: Date
  }
});

// Create model only if not already defined (prevents model recompilation error)
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

// Connect to MongoDB
async function connectToDatabase() {
  try {
    if (isConnected) {
      return true;
    }

    if (!MONGODB_URI) {
      console.log('No MongoDB URI provided');
      return false;
    }

    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(MONGODB_URI);
    
    isConnected = true;
    console.log('MongoDB Connected');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnected = false;
    return false;
  }
}

module.exports = {
  connectToDatabase,
  Submission
};