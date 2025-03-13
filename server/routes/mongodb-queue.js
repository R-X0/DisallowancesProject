// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
const { connectToDatabase, Submission } = require('../db-connection');

// Get all submissions for queue display
router.get('/', async (req, res) => {
  try {
    // Ensure connected to database
    await connectToDatabase();
    
    // Fetch submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({})
      .sort({ receivedAt: -1 })
      .limit(50);
      
    // Transform data to match expected format for QueueDisplay
    const queueItems = submissions.map(submission => {
      // Extract business name from originalData
      const formData = submission.originalData?.formData || {};
      const businessName = formData.requestedInfo?.business_name || 
                          formData.businessName ||
                          'Unnamed Business';
      
      // Determine status based on report generation
      let status = 'waiting';
      if (submission.report && submission.report.generated) {
        status = 'complete';
      } else if (submission.receivedFiles && submission.receivedFiles.length > 0) {
        status = 'processing';
      }
      
      return {
        id: submission.submissionId,
        businessName,
        timestamp: submission.receivedAt,
        status,
        submissionData: submission,
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