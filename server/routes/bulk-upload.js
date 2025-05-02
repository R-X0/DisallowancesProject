// server/routes/bulk-upload.js
// UPDATED CODE WITH FIX FOR REVENUE DATA

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { Submission } = require('../db-connection');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `bulk-upload-${Date.now()}-${path.basename(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /xlsx|xls/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed!'));
    }
  }
});

// Helper function to map quarter names to standard format
const mapQuarterFormat = (quarter) => {
  // Standardize quarter format to "Q1 2021" style
  if (quarter.startsWith('1Q')) return `Q1 ${quarter.substring(2)}`;
  if (quarter.startsWith('2Q')) return `Q2 ${quarter.substring(2)}`;
  if (quarter.startsWith('3Q')) return `Q3 ${quarter.substring(2)}`;
  if (quarter.startsWith('4Q')) return `Q4 ${quarter.substring(2)}`;
  return quarter; // Return as is if it already matches
};

// Process Excel file and create submissions
router.post('/process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    console.log(`Processing bulk upload file: ${req.file.path}`);
    
    // Read the Excel file
    const workbook = XLSX.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Excel file contains no data'
      });
    }
    
    console.log(`Found ${data.length} rows in Excel file`);
    
    // Process each row and create submissions
    const results = [];
    
    for (const row of data) {
      try {
        // Skip rows without Client Name or EIN
        if (!row['Client Name'] || !row['EIN']) {
          results.push({
            businessName: row['Client Name'] || 'Unknown',
            ein: row['EIN'] || 'Missing',
            status: 'skipped',
            message: 'Missing required data (Client Name or EIN)'
          });
          continue;
        }
        
        // Identify qualifying quarters
        const qualifyingQuarters = [];
        const qualificationReasons = {};
        const revenueData = {};
        
        // Check all quarter columns for qualification
        for (let i = 2020; i <= 2021; i++) {
          for (let q = 1; q <= 4; q++) {
            // Skip Q1 2020 as it's not applicable for ERC
            if (i === 2020 && q === 1) continue;
            
            const quarterKey = `${q}Q${i.toString().substring(2)}`;
            const qualificationField = `${quarterKey} Qualification`;
            const amountField = `${quarterKey} Amount`;
            
            if (row[qualificationField] && 
                row[qualificationField] !== 'N/A' && 
                row[amountField] > 0) {
              const standardQuarter = mapQuarterFormat(quarterKey);
              qualifyingQuarters.push(standardQuarter);
              qualificationReasons[standardQuarter] = row[qualificationField];
            }
          }
        }
        
        // Gather revenue data from the Excel
        // Map the Excel columns to the field names in the form
        const revenueMapping = {
          '19Q1': 'q1_2019',
          '19Q2': 'q2_2019',
          '19Q3': 'q3_2019',
          '19Q4': 'q4_2019',
          '20Q1': 'q1_2020',
          '20Q2': 'q2_2020',
          '20Q3': 'q3_2020',
          '20Q4': 'q4_2020',
          '21Q1': 'q1_2021',
          '21Q2': 'q2_2021',
          '21Q3': 'q3_2021',
          '21Q4': 'q4_2021'
        };
        
        // Fill in the revenue data object
        for (const [excelField, formField] of Object.entries(revenueMapping)) {
          if (row[excelField] !== undefined && row[excelField] !== null) {
            revenueData[formField] = row[excelField].toString();
          }
        }
        
        // Determine approach based on qualification reasons
        let approach = 'governmentOrders';
        let approachInfo = '';
        
        // Check if any quarter mentions revenue reduction
        const hasRevenueReduction = Object.values(qualificationReasons)
          .some(reason => reason.toLowerCase().includes('revenue'));
          
        // Check if any quarter mentions supply chain
        const hasSupplyChain = Object.values(qualificationReasons)
          .some(reason => reason.toLowerCase().includes('supply chain'));
        
        if (hasRevenueReduction) {
          approach = 'revenueReduction';
          approachInfo = `Business qualified for ERC through revenue reduction in quarters: ${
            Object.entries(qualificationReasons)
              .filter(([_, reason]) => reason.toLowerCase().includes('revenue'))
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        } else if (hasSupplyChain) {
          approach = 'governmentOrders';
          approachInfo = `Business qualified through government orders affecting supply chain during: ${
            Object.entries(qualificationReasons)
              .filter(([_, reason]) => reason.toLowerCase().includes('supply chain'))
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        } else {
          approachInfo = `Business qualified through government orders/shutdown during: ${
            Object.entries(qualificationReasons)
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        }
        
        // Generate a new ID for the submission
        const submissionId = `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
        
        // Create the submission data
        const submissionData = {
          submissionId,
          businessName: row['Client Name'],
          ein: row['EIN'],
          location: 'Unknown', // Set default location
          timePeriods: qualifyingQuarters,
          status: 'Gathering data'
        };
        
        // Add approach specific fields
        if (approach === 'revenueReduction') {
          submissionData.revenueReductionInfo = approachInfo;
        } else {
          submissionData.governmentOrdersInfo = approachInfo;
        }
        
        // FIX: Add revenue data fields DIRECTLY to the submission, not just inside submissionData
        for (const [field, value] of Object.entries(revenueData)) {
          submissionData[field] = value;
        }
        
        // Create submission record in database
        const submission = new Submission({
          ...submissionData,
          submissionData: {
            ...revenueData, // Keep copy in submissionData for consistency
            qualificationReasons,
            lastSaved: new Date().toISOString()
          }
        });
        
        await submission.save();
        
        // Store result
        results.push({
          businessName: row['Client Name'],
          ein: row['EIN'],
          status: 'success',
          qualifyingQuarters,
          submissionId,
          message: `Created submission for ${qualifyingQuarters.length} quarters`
        });
        
      } catch (error) {
        console.error(`Error processing row for ${row['Client Name']}:`, error);
        results.push({
          businessName: row['Client Name'] || 'Unknown',
          ein: row['EIN'] || 'Unknown',
          status: 'error',
          message: error.message
        });
      }
    }
    
    // Clean up the temporary file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error removing temp file:', err);
    });
    
    // Return the results
    res.status(200).json({
      success: true,
      message: `Processed ${data.length} rows`,
      results,
      stats: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        error: results.filter(r => r.status === 'error').length,
        skipped: results.filter(r => r.status === 'skipped').length
      }
    });
    
  } catch (error) {
    console.error('Error processing bulk upload:', error);
    
    // Clean up the temporary file if it exists
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error removing temp file:', err);
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Error processing bulk upload: ${error.message}`
    });
  }
});

module.exports = router;