// server/tools/mongo-inspector.js
// Run this script to inspect your MongoDB submissions and fix issues

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// MongoDB connection string from .env file
const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000
    });
    
    console.log('Connected successfully to MongoDB');
    
    // Get all collections in the database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:');
    collections.forEach(coll => console.log(`- ${coll.name}`));
    
    // Check if submissions collection exists
    const hasSubmissions = collections.some(coll => coll.name === 'submissions');
    if (!hasSubmissions) {
      console.error('No "submissions" collection found in the database!');
      console.log('Available collections: ' + collections.map(c => c.name).join(', '));
      return;
    }
    
    // Get a count of submissions
    const submissions = mongoose.connection.db.collection('submissions');
    const count = await submissions.countDocuments();
    console.log(`Found ${count} submissions in the database`);
    
    // Get the most recent submissions
    const recentSubmissions = await submissions.find().sort({ receivedAt: -1 }).limit(5).toArray();
    console.log(`Retrieved ${recentSubmissions.length} recent submissions`);
    
    // Analyze each submission
    for (let i = 0; i < recentSubmissions.length; i++) {
      const submission = recentSubmissions[i];
      console.log(`\n======= SUBMISSION ${i+1} =======`);
      console.log(`ID: ${submission._id}`);
      
      // Basic info
      console.log(`Submission ID: ${submission.submissionId || 'Not set'}`);
      console.log(`Received At: ${submission.receivedAt ? new Date(submission.receivedAt).toISOString() : 'Not set'}`);
      
      // Check data structure
      console.log('\nData Structure Check:');
      console.log(`Has originalData: ${!!submission.originalData}`);
      console.log(`Has receivedFiles: ${!!submission.receivedFiles} (${submission.receivedFiles ? submission.receivedFiles.length : 0} files)`);
      console.log(`Has report: ${!!submission.report}`);
      
      // Detailed file check
      if (submission.receivedFiles && submission.receivedFiles.length > 0) {
        console.log('\nFiles:');
        submission.receivedFiles.forEach((file, idx) => {
          console.log(`File ${idx+1}:`);
          console.log(`  Name: ${file.originalName || 'Missing'}`);
          console.log(`  Path: ${file.savedPath || 'Missing'}`);
          
          // Check if file exists on disk
          if (file.savedPath && typeof file.savedPath === 'string') {
            try {
              const exists = fs.existsSync(file.savedPath);
              console.log(`  File exists: ${exists}`);
              
              if (!exists) {
                // Try to find alternatives - maybe the paths are relative
                const basePaths = [
                  './',
                  './uploads',
                  './server/uploads',
                  '../uploads'
                ];
                
                let found = false;
                const filename = path.basename(file.savedPath);
                
                for (const basePath of basePaths) {
                  const alternatePath = path.join(basePath, filename);
                  if (fs.existsSync(alternatePath)) {
                    console.log(`  Found at alternate path: ${alternatePath}`);
                    found = true;
                    
                    // Option to fix the path - uncomment to enable
                    /*
                    console.log(`  FIXING: Updating path to ${alternatePath}`);
                    await submissions.updateOne(
                      { _id: submission._id, "receivedFiles.savedPath": file.savedPath },
                      { $set: { "receivedFiles.$.savedPath": alternatePath } }
                    );
                    */
                    break;
                  }
                }
                
                if (!found) {
                  console.log(`  File not found in any common location`);
                }
              }
            } catch (error) {
              console.error(`  Error checking file: ${error.message}`);
            }
          } else {
            console.log(`  Invalid path format: ${typeof file.savedPath}`);
          }
        });
      }
      
      // Check report
      if (submission.report) {
        console.log('\nReport:');
        console.log(`  Generated: ${submission.report.generated ? 'Yes' : 'No'}`);
        console.log(`  Path: ${submission.report.path || 'Not set'}`);
        
        if (submission.report.path) {
          // Check if report exists on disk
          try {
            const exists = fs.existsSync(submission.report.path);
            console.log(`  Report exists: ${exists}`);
            
            if (!exists) {
              // Similar logic as files - check alternate locations
              const basePaths = [
                './',
                './reports',
                './server/reports',
                '../reports'
              ];
              
              let found = false;
              const filename = path.basename(submission.report.path);
              
              for (const basePath of basePaths) {
                const alternatePath = path.join(basePath, filename);
                if (fs.existsSync(alternatePath)) {
                  console.log(`  Found at alternate path: ${alternatePath}`);
                  found = true;
                  break;
                }
              }
              
              if (!found) {
                console.log(`  Report not found in any common location`);
              }
            }
          } catch (error) {
            console.error(`  Error checking report: ${error.message}`);
          }
        }
      }
    }
    
    // Close the connection
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Execute the script
run();