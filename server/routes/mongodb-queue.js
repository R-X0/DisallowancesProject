// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
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
      
      // Log the first few transformed submissions
      if (submissions.indexOf(submission) < 3) {
        console.log(`Queue item for ${submission.submissionId || submission.id}: ${businessName} (${status})`);
      }
      
      // Use the ID from the right place based on your structure
      const submissionId = submission.submissionId || submission.id;
      
      return {
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
        reportPath: submission.report?.path || null
      };
    });
    
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

// Download file endpoint
router.get('/download', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      return res.redirect(filePath);
    }
    
    // Otherwise, handle as a local file
    try {
      if (!require('fs').existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      // Send file
      res.download(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error downloading file: ${error.message}`
    });
  }
});

module.exports = router;