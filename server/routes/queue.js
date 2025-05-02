// server/routes/queue.js
// FIXED TO PREVENT DUPLICATE SUBMISSIONS WITH DIFFERENT ID FORMATS

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
    // Try to find submission with flexible ID matching
    const submissionId = req.params.id;
    const possibleIds = [
      submissionId,
      submissionId.toString(),
      submissionId.startsWith('ERC-') ? submissionId : `ERC-${submissionId}`,
      submissionId.startsWith('ERC-') ? submissionId.substring(4) : submissionId
    ];
    
    let submission = null;
    for (const idVar of possibleIds) {
      const found = await Submission.findOne({ submissionId: idVar });
      if (found) {
        submission = found;
        console.log(`Found submission with ID variation: ${idVar}`);
        break;
      }
    }
    
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

// Save or update a submission - ENHANCED FOR REVENUE DATA AND FIXED TO PREVENT DUPLICATES
router.post('/save', async (req, res) => {
  try {
    const { submissionId, ...submissionData } = req.body;
    
    // Generate a new ID if not provided
    const id = submissionId || `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
    
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
    
    // Log the ID format we received 
    console.log(`Attempting to save/update submission with ID: ${id}`);
    
    // IMPROVED: Try to find existing submission with more flexible ID matching
    let submission = null;
    
    // Try different formats of the same ID
    const idVariations = [
      id,
      id.toString(),
      id.startsWith('ERC-') ? id : `ERC-${id}`,
      id.startsWith('ERC-') ? id.substring(4) : id
    ];
    
    console.log(`Checking for existing submission with ID variations: ${idVariations.join(', ')}`);
    
    for (const idVar of idVariations) {
      const found = await Submission.findOne({ submissionId: idVar });
      if (found) {
        submission = found;
        console.log(`Found existing submission with ID variation: ${idVar}`);
        break;
      }
    }
    
    if (submission) {
      console.log(`Updating existing submission with ID: ${submission.submissionId}`);
      
      // Update existing submission - with revenue fields preserved at top level
      submission = await Submission.findOneAndUpdate(
        { submissionId: submission.submissionId },
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
      if (submission.submissionData) {
        // Add revenue data to submissionData for backward compatibility
        const existingSubmissionData = submission.submissionData || {};
        const updatedSubmissionData = {
          ...existingSubmissionData,
          ...revenueData,
          lastUpdated: new Date().toISOString()
        };
        
        // Update submissionData separately
        await Submission.findOneAndUpdate(
          { submissionId: submission.submissionId },
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
      console.log(`Creating new submission with ID: ${id}`);
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
      submission = new Submission({
        submissionId: id,
        ...submissionData,
        ...revenueData, // Add revenue data at top level
        submissionData: submissionDataObj // Also in submissionData
      });
      
      // Explicitly log what we're saving
      console.log(`Creating submission with fields: ${Object.keys(submission.toObject()).join(', ')}`);
      
      // Save with strict mode disabled
      await submission.save({ strict: false });
      
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
    const submissionId = req.params.id;
    console.log(`Attempting to delete submission: ${submissionId}`);
    
    // Try different ID formats for deletion too
    const idVariations = [
      submissionId,
      submissionId.toString(),
      submissionId.startsWith('ERC-') ? submissionId : `ERC-${submissionId}`,
      submissionId.startsWith('ERC-') ? submissionId.substring(4) : submissionId
    ];
    
    let deleted = false;
    
    for (const idVar of idVariations) {
      const result = await Submission.findOneAndDelete({ submissionId: idVar });
      if (result) {
        console.log(`Successfully deleted submission with ID variation: ${idVar}`);
        deleted = true;
        break;
      }
    }
    
    if (!deleted) {
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