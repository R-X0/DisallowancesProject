// server/routes/queue.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// In-memory queue (for demo purposes)
let processingQueue = [];

// Get the current queue
router.get('/', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      queue: processingQueue
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching queue: ${error.message}`
    });
  }
});

// Add an item to the queue (this will be called by the external server)
router.post('/add', async (req, res) => {
  try {
    const { id, businessName, status = 'waiting' } = req.body;
    
    if (!id || !businessName) {
      return res.status(400).json({
        success: false,
        message: 'ID and business name are required'
      });
    }
    
    // Create new queue item
    const newItem = {
      id,
      businessName,
      status,
      timestamp: new Date().toISOString()
    };
    
    // Add to queue
    processingQueue.push(newItem);
    
    // Limit queue size (optional)
    if (processingQueue.length > 50) {
      processingQueue = processingQueue.slice(-50);
    }
    
    res.status(201).json({
      success: true,
      message: 'Item added to queue',
      item: newItem
    });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({
      success: false,
      message: `Error adding to queue: ${error.message}`
    });
  }
});

// Update item status in the queue
router.post('/update', async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({
        success: false,
        message: 'ID and status are required'
      });
    }
    
    // Find and update the item
    const itemIndex = processingQueue.findIndex(item => item.id === id);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in queue'
      });
    }
    
    // Update status
    processingQueue[itemIndex].status = status;
    
    // Optional: Remove completed items after some time
    if (status === 'complete') {
      setTimeout(() => {
        processingQueue = processingQueue.filter(item => item.id !== id);
      }, 3600000); // Remove after 1 hour
    }
    
    res.status(200).json({
      success: true,
      message: 'Item status updated',
      item: processingQueue[itemIndex]
    });
  } catch (error) {
    console.error('Error updating queue item:', error);
    res.status(500).json({
      success: false,
      message: `Error updating queue item: ${error.message}`
    });
  }
});

module.exports = router;