// server/tools/mongodb-debug.js
// A utility script to debug MongoDB submissions and file paths

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// MongoDB connection string from .env file
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB
async function connectToDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    
    if (!MONGODB_URI) {
      console.error('ERROR: No MongoDB URI provided in environment variables');
      return false;
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');
    return true;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    return false;
  }
}

// Define the Submission schema (make sure this matches your actual schema)
const submissionSchema = new mongoose.Schema({
  submissionId: String,
  userId: String,
  userEmail: String,
  receivedAt: Date,
  originalData: mongoose.Schema.Types.Mixed,
  receivedFiles: [{
    originalName: String,
    savedPath: String,
    size: Number,
    mimetype: String
  }],
  report: {
    generated: Boolean,
    path: String
  }
}, { strict: false }); // Using strict: false to allow for flexible document structure

const Submission = mongoose.model('Submission', submissionSchema);

async function debugSubmissions() {
  try {
    const isConnected = await connectToDatabase();
    if (!isConnected) {
      console.error('Failed to connect to MongoDB');
      return;
    }

    // Get all submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({}).sort({ receivedAt: -1 }).limit(10);
    
    console.log(`Found ${submissions.length} submissions in MongoDB`);
    
    for (let i = 0; i < submissions.length; i++) {
      const submission = submissions[i];
      console.log(`\n===== SUBMISSION ${i+1} =====`);
      console.log(`ID: ${submission._id}`);
      console.log(`Submission ID: ${submission.submissionId || 'Not set'}`);
      console.log(`Received At: ${submission.receivedAt}`);
      
      // Try to extract business name from data
      let businessName = 'Unnamed Business';
      try {
        if (submission.originalData && submission.originalData.formData) {
          if (submission.originalData.formData.businessName) {
            businessName = submission.originalData.formData.businessName;
          } else if (submission.originalData.formData.userEmail) {
            businessName = `Submission from ${submission.originalData.formData.userEmail}`;
          }
        }
        
        if (submission.userEmail) {
          businessName = `Submission from ${submission.userEmail}`;
        }
      } catch (err) {
        console.log('Error extracting business name:', err.message);
      }
      console.log(`Business Name: ${businessName}`);
      
      // Check file information
      if (submission.receivedFiles && submission.receivedFiles.length > 0) {
        console.log(`Files: ${submission.receivedFiles.length}`);
        submission.receivedFiles.forEach((file, index) => {
          console.log(`  File ${index+1}:`);
          console.log(`    Name: ${file.originalName}`);
          console.log(`    Path: ${file.savedPath}`);
          console.log(`    Size: ${file.size} bytes`);
          console.log(`    Type: ${file.mimetype}`);
          
          // Check if file exists on disk
          if (file.savedPath) {
            const fileExists = fs.existsSync(file.savedPath);
            console.log(`    File exists on disk: ${fileExists}`);
          }
        });
      } else {
        console.log('Files: None found in submission');
      }
      
      // Check report information
      if (submission.report) {
        console.log(`Report Generated: ${submission.report.generated}`);
        console.log(`Report Path: ${submission.report.path || 'Not set'}`);
        
        // Check if report exists on disk
        if (submission.report.path) {
          const reportExists = fs.existsSync(submission.report.path);
          console.log(`Report exists on disk: ${reportExists}`);
        }
      } else {
        console.log('Report: None found in submission');
      }
      
      // Show the full document structure in condensed form
      console.log('\nDocument Structure:');
      console.log(JSON.stringify(getDocumentStructure(submission.toObject()), null, 2));
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error debugging submissions:', error);
  }
}

// Helper function to get document structure without actual data
function getDocumentStructure(obj, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return '...';
  
  if (obj === null || obj === undefined) return null;
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return [getDocumentStructure(obj[0], maxDepth, currentDepth + 1), `...and ${obj.length-1} more items`];
  }
  
  if (typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      if (key === 'originalData' && currentDepth > 0) {
        result[key] = '...large object...';
      } else {
        result[key] = getDocumentStructure(obj[key], maxDepth, currentDepth + 1);
      }
    }
    return result;
  }
  
  if (typeof obj === 'string') {
    if (obj.length > 30) return obj.substring(0, 27) + '...';
    return obj;
  }
  
  return typeof obj;
}

// Run the debug function
debugSubmissions();