// db-connection.js
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string from .env file
const MONGODB_URI = process.env.MONGODB_URI;

// Track connection status
let isConnected = false;
let connectionAttempted = false;

// Connect to MongoDB
const connectToDatabase = async () => {
  try {
    // Add more detailed logging
    console.log('connectToDatabase called');
    console.log('MONGODB_URI defined:', !!MONGODB_URI);
    
    if (!MONGODB_URI) {
      console.error('ERROR: No MongoDB URI provided in environment variables');
      return false;
    }

    if (isConnected) {
      console.log('Using existing MongoDB connection');
      return true;
    }

    if (connectionAttempted) {
      console.log('Previous connection attempt failed, skipping retry');
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
    
    // Verify we can access a collection
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name).join(', '));
    
    return true;
  } catch (error) {
    console.error('Error connecting to MongoDB:');
    console.error('- Message:', error.message);
    console.error('- Code:', error.code);
    console.error('- Name:', error.name);
    isConnected = false;
    return false;
  }
};

// Add a database name to your connection string if it's missing
if (MONGODB_URI && !MONGODB_URI.includes('/?') && !MONGODB_URI.split('/')[3]) {
  console.log('WARNING: Your MongoDB URI may be missing a database name');
  console.log('Consider adding a database name: mongodb+srv://user:pass@cluster.domain/database_name?retryWrites=true&w=majority');
}

// The rest of your code (schema definitions, etc.)
const submissionSchema = new mongoose.Schema({
  // Your schema definition
});

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = {
  connectToDatabase,
  Submission,
  isConnected: () => isConnected
};