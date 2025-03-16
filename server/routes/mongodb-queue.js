// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { connectToDatabase, Submission } = require('../db-connection');

// Get all submissions for queue display
router.get('/', async (req, res) => {
  try {
    // Ensure connected to database
    await connectToDatabase();
    console.log('Connected to MongoDB, fetching submissions...');
    
    // Fetch submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({})
      .sort({ receivedAt: -1 })
      .limit(50);
    
    console.log(`Found ${submissions.length} submissions in MongoDB`);
    
    // Transform data to match expected format for QueueDisplay
    const queueItems = submissions.map(submission => {
      // Extract a meaningful identifier based on your actual data structure
      let businessName = 'Unnamed Business';
      
      try {
        const originalData = submission.originalData || {};
        const formData = originalData.formData || {};
        
        // Try to create a business identifier from owner information
        if (formData.ownershipStructure && formData.ownershipStructure.length > 0) {
          const primaryOwner = formData.ownershipStructure.sort((a, b) => 
            parseInt(b.ownership_percentage) - parseInt(a.ownership_percentage)
          )[0];
          
          if (primaryOwner && primaryOwner.owner_name) {
            businessName = `${primaryOwner.owner_name}'s Business`;
          }
        }
        
        // If we have a user email, use that instead
        if (formData.userEmail && formData.userEmail.trim()) {
          businessName = `Submission from ${formData.userEmail}`;
        }
        
        // Use timestamp as last resort
        if (businessName === 'Unnamed Business') {
          const date = new Date(submission.receivedAt);
          businessName = `Submission from ${date.toLocaleDateString()}`;
        }
      } catch (err) {
        console.error(`Error extracting business name for submission ${submission.submissionId}:`, err);
        businessName = `Submission #${submission.submissionId || submission.id}`;
      }
      
      // Determine status based on report generation and files
      let status = 'waiting';
      if (submission.report && submission.report.generated) {
        status = 'complete';
      } else if (submission.receivedFiles && submission.receivedFiles.length > 0) {
        status = 'processing';
      }
      
      // Log report path if it exists to help with debugging
      let reportPath = null;
      if (submission.report && submission.report.path) {
        reportPath = submission.report.path;
        console.log(`Found report path for submission ${submission.submissionId || submission._id}: ${reportPath}`);
      }
      
      // Use the ID from the right place based on your structure
      const submissionId = submission.submissionId || submission._id;
      
      const result = {
        id: submissionId,
        businessName,
        timestamp: submission.receivedAt,
        status,
        submissionData: submission.toObject ? submission.toObject() : submission,
        files: submission.receivedFiles?.map(file => ({
          name: file.originalName,
          path: file.savedPath,
          type: file.mimetype,
          size: file.size
        })) || [],
        reportPath: reportPath
      };
      
      return result;
    });
    
    // Log the first item's structure if available
    if (queueItems.length > 0) {
      console.log('Sample queue item structure:');
      console.log('- ID:', queueItems[0].id);
      console.log('- Business Name:', queueItems[0].businessName);
      console.log('- reportPath:', queueItems[0].reportPath);
      console.log('- Has files:', queueItems[0].files?.length > 0);
    }
    
    res.status(200).json({
      success: true,
      queue: queueItems
    });
  } catch (error) {
    console.error('Error fetching MongoDB queue:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching queue data: ${error.message}`
    });
  }
});

// Download file endpoint with better error reporting
router.get('/download', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }
    
    console.log(`Download requested for: ${filePath}`);
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      console.log('URL detected, redirecting');
      return res.redirect(filePath);
    }
    
    // Otherwise, handle as a local file
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`File not found at path: ${filePath}`);
        return res.status(404).json({
          success: false,
          message: 'File not found at: ' + filePath
        });
      }

      // Get file stats for debug info
      const stats = fs.statSync(filePath);
      console.log(`File exists (${stats.size} bytes), sending download`);
      
      // Get file extension to set the correct content type
      const ext = path.extname(filePath).toLowerCase();
      
      // Set appropriate content type based on file extension
      let contentType = 'application/octet-stream'; // Default
      
      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (ext === '.xls') {
        contentType = 'application/vnd.ms-excel';
      } else if (ext === '.csv') {
        contentType = 'text/csv';
      } else if (ext === '.json') {
        contentType = 'application/json';
      }
      
      console.log(`Using content type: ${contentType} for extension: ${ext}`);
      
      // Set content disposition to force download
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      res.setHeader('Content-Type', contentType);
      
      // Create read stream and pipe to response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
    } catch (error) {
      console.error(`Error accessing file ${filePath}:`, error);
      return res.status(500).json({
        success: false,
        message: `Error accessing file: ${error.message}`,
        path: filePath
      });
    }
  } catch (error) {
    console.error('Error in download endpoint:', error);
    res.status(500).json({
      success: false,
      message: `Error in download endpoint: ${error.message}`
    });
  }
});

module.exports = router;