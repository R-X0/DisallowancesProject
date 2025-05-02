// server/routes/queue.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Submission } = require('../db-connection');

// Get all submissions (for queue display)
router.get('/submissions', async (req, res) => {
  try {
    // Get the latest 20 submissions, sorted by lastUpdated
    const submissions = await Submission.find({})
      .sort({ lastUpdated: -1 })
      .limit(20)
      .select('submissionId businessName timePeriods status lastUpdated');
    
    res.status(200).json({
      success: true,
      submissions
    });
  } catch (error) {
    console.error('Error fetching submissions for queue:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching submissions: ${error.message}`
    });
  }
});

// Get a specific submission by ID
router.get('/submission/:id', async (req, res) => {
  try {
    const submission = await Submission.findOne({ submissionId: req.params.id });
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    res.status(200).json({
      success: true,
      submission
    });
  } catch (error) {
    console.error('Error fetching submission details:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching submission: ${error.message}`
    });
  }
});

// Save or update a submission
router.post('/save', async (req, res) => {
  try {
    const { submissionId, ...submissionData } = req.body;
    
    // Generate a new ID if not provided
    const id = submissionId || `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Try to find existing submission
    let submission = await Submission.findOne({ submissionId: id });
    
    if (submission) {
      // Update existing submission
      submission = await Submission.findOneAndUpdate(
        { submissionId: id },
        { 
          ...submissionData,
          lastUpdated: new Date()
        },
        { new: true }
      );
      
      res.status(200).json({
        success: true,
        message: 'Submission updated successfully',
        submissionId: id
      });
    } else {
      // Create new submission
      submission = new Submission({
        submissionId: id,
        ...submissionData
      });
      
      await submission.save();
      
      res.status(201).json({
        success: true,
        message: 'Submission saved successfully',
        submissionId: id
      });
    }
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({
      success: false,
      message: `Error saving submission: ${error.message}`
    });
  }
});

// Delete a submission
router.delete('/submission/:id', async (req, res) => {
  try {
    const result = await Submission.findOneAndDelete({ submissionId: req.params.id });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Submission deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({
      success: false,
      message: `Error deleting submission: ${error.message}`
    });
  }
});

module.exports = router;