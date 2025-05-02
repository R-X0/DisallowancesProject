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
    // Get the ID from params
    const submissionId = req.params.id;
    
    // Create two variations: with prefix and without prefix
    const idWithPrefix = submissionId.startsWith('ERC-') ? submissionId : `ERC-${submissionId}`;
    const idWithoutPrefix = submissionId.startsWith('ERC-') ? submissionId.substring(4) : submissionId;
    
    console.log(`Looking for submission with ID variations: ${idWithPrefix}, ${idWithoutPrefix}`);
    
    // Try to find with either format
    const submission = await Submission.findOne({ 
      $or: [
        { submissionId: idWithPrefix },
        { submissionId: idWithoutPrefix }
      ]
    });
    
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
    let id = submissionId || `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Ensure consistent format - normalize to include ERC- prefix
    const idWithPrefix = id.startsWith('ERC-') ? id : `ERC-${id}`;
    const idWithoutPrefix = id.startsWith('ERC-') ? id.substring(4) : id;
    
    console.log(`Attempting to save/update submission with ID: ${idWithPrefix}`);
    console.log(`Checking for existing submission with ID variations: ${idWithPrefix}, ${idWithoutPrefix}`);
    
    // Check for existing submission with either ID format
    const submission = await Submission.findOne({ 
      $or: [
        { submissionId: idWithPrefix },
        { submissionId: idWithoutPrefix }
      ]
    });
    
    // Extract all revenue fields
    const revenueFields = [
      'q1_2019', 'q2_2019', 'q3_2019', 'q4_2019',
      'q1_2020', 'q2_2020', 'q3_2020', 'q4_2020',
      'q1_2021', 'q2_2021', 'q3_2021'
    ];
    
    // Extract revenue data from submissionData
    const revenueData = {};
    for (const field of revenueFields) {
      if (submissionData[field] !== undefined) {
        revenueData[field] = submissionData[field];
      }
    }
    
    if (submission) {
      console.log(`Updating existing submission with ID: ${submission.submissionId}`);
      
      // Update existing submission - with revenue fields preserved at top level
      const updatedSubmission = await Submission.findOneAndUpdate(
        { _id: submission._id },
        { 
          ...submissionData,
          // Ensure revenue data is explicitly updated at the top level
          ...revenueData,
          lastUpdated: new Date()
        },
        { 
          new: true,
          // Disable strict mode for this operation to allow fields not in schema
          strict: false 
        }
      );
      
      // Also ensure revenue data is in submissionData for backward compatibility
      if (updatedSubmission) {
        // Add revenue data to submissionData for backward compatibility
        const existingSubmissionData = updatedSubmission.submissionData || {};
        const updatedSubmissionData = {
          ...existingSubmissionData,
          ...revenueData,
          lastUpdated: new Date().toISOString()
        };
        
        // Update submissionData separately
        await Submission.findOneAndUpdate(
          { _id: updatedSubmission._id },
          { submissionData: updatedSubmissionData },
          { strict: false }
        );
        
        console.log(`Updated submissionData with ${Object.keys(revenueData).length} revenue fields`);
      }
      
      res.status(200).json({
        success: true,
        message: 'Submission updated successfully',
        submissionId: submission.submissionId
      });
    } else {
      console.log(`Creating new submission with ID: ${idWithPrefix}`);
      // Prepare submissionData with revenue in both places
      const submissionDataObj = {
        ...(submissionData.submissionData || {}),
        lastSaved: new Date().toISOString()
      };
      
      // Add revenue to submissionData object too for backward compatibility
      for (const [field, value] of Object.entries(revenueData)) {
        submissionDataObj[field] = value;
      }
      
      // Create new submission with revenue data at both levels
      const newSubmission = new Submission({
        submissionId: idWithPrefix, // ALWAYS use prefix format for new entries
        ...submissionData,
        ...revenueData, // Add revenue data at top level
        submissionData: submissionDataObj // Also in submissionData
      });
      
      // Explicitly log what we're saving
      console.log(`Creating submission with fields: ${Object.keys(newSubmission.toObject()).join(', ')}`);
      
      // Save with strict mode disabled
      await newSubmission.save({ strict: false });
      
      res.status(201).json({
        success: true,
        message: 'Submission saved successfully',
        submissionId: idWithPrefix
      });
    }
  } catch (error) {
    // Handle duplicate key errors specifically
    if (error.code === 11000) {
      console.error('Duplicate key error while saving submission:', error);
      
      // Try to find the submission that caused the conflict
      try {
        const id = req.body.submissionId || '';
        const idWithPrefix = id.startsWith('ERC-') ? id : `ERC-${id}`;
        const idWithoutPrefix = id.startsWith('ERC-') ? id.substring(4) : id;
        
        const existingDoc = await Submission.findOne({ 
          $or: [
            { submissionId: idWithPrefix },
            { submissionId: idWithoutPrefix }
          ]
        });
        
        if (existingDoc) {
          return res.status(200).json({
            success: true,
            message: 'Found existing submission (duplicate key)',
            submissionId: existingDoc.submissionId
          });
        }
      } catch (findError) {
        console.error('Error finding existing submission after duplicate key error:', findError);
      }
    }
    
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
    const submissionId = req.params.id;
    console.log(`Attempting to delete submission: ${submissionId}`);
    
    // Create two variations: with prefix and without prefix
    const idWithPrefix = submissionId.startsWith('ERC-') ? submissionId : `ERC-${submissionId}`;
    const idWithoutPrefix = submissionId.startsWith('ERC-') ? submissionId.substring(4) : submissionId;
    
    // Delete with either format
    const result = await Submission.findOneAndDelete({ 
      $or: [
        { submissionId: idWithPrefix },
        { submissionId: idWithoutPrefix }
      ]
    });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    console.log(`Successfully deleted submission with ID: ${result.submissionId}`);
    
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