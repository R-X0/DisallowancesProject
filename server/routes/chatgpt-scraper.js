// server/routes/chatgpt-scraper.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const documentGenerator = require('../services/documentGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const urlProcessor = require('../services/urlProcessor');
const packageCreator = require('../services/packageCreator');
const protestDriveUploader = require('../services/protestDriveUploader');
const multer = require('multer');

// Configure multer for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/temp'));
  },
  filename: (req, file, cb) => {
    cb(null, `address-extract-${Date.now()}-${file.originalname}`);
  }
});

const pdfUpload = multer({ storage: pdfStorage });

// Generate customized COVID prompt through OpenAI
router.post('/generate-prompt', async (req, res) => {
  try {
    const { basePrompt, businessInfo } = req.body;
    
    if (!basePrompt || !businessInfo) {
      return res.status(400).json({
        success: false,
        message: 'Base prompt and business information are required'
      });
    }
    
    // Use the documentGenerator to create a customized prompt
    const customizedPrompt = await documentGenerator.generateCustomPrompt(basePrompt, businessInfo);
    
    res.status(200).json({
      success: true,
      prompt: customizedPrompt
    });
  } catch (error) {
    console.error('Error generating customized prompt:', error);
    res.status(500).json({
      success: false,
      message: `Error generating prompt: ${error.message}`
    });
  }
});

// New endpoint to extract IRS address from PDF files
router.post('/extract-irs-address', pdfUpload.array('pdfFiles', 5), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No PDF files provided'
      });
    }
    
    console.log(`Received ${files.length} PDFs for IRS address extraction`);
    
    // Try to extract address from each file until we find one
    let extractedAddress = null;
    
    for (const file of files) {
      try {
        const pdfPath = file.path;
        console.log(`Attempting to extract IRS address from: ${pdfPath}`);
        
        // Use the documentGenerator function to extract the address
        const address = await documentGenerator.extractIrsAddressFromFile(pdfPath);
        
        if (address) {
          extractedAddress = address;
          console.log(`Successfully extracted IRS address: ${address}`);
          break;
        }
      } catch (extractError) {
        console.error(`Error extracting from ${file.originalname}:`, extractError);
        // Continue to next file
      }
    }
    
    res.status(200).json({
      success: true,
      address: extractedAddress
    });
    
    // Clean up temporary files after response is sent
    try {
      for (const file of files) {
        fs.unlink(file.path, (err) => {
          if (err) console.error(`Error deleting temp file ${file.path}:`, err);
        });
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
    
  } catch (error) {
    console.error('Error extracting IRS address from PDFs:', error);
    res.status(500).json({
      success: false,
      message: `Error extracting IRS address: ${error.message}`
    });
  }
});

// Job status endpoint - NEW
router.get('/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required'
      });
    }
    
    console.log(`Checking status for job: ${jobId}`);
    
    // Get path based on jobId
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${jobId}`);
    const statusFilePath = path.join(outputDir, 'job_status.json');
    
    // Check if status file exists
    if (fsSync.existsSync(statusFilePath)) {
      try {
        const statusData = await fs.readFile(statusFilePath, 'utf8');
        const job = JSON.parse(statusData);
        console.log(`Job status from file: ${job.status}, progress: ${job.progress}%`);
        return res.status(200).json({
          success: true,
          job
        });
      } catch (readError) {
        console.error(`Error reading status file: ${readError.message}`);
        // Fall through to check files directly
      }
    }
    
    // Check if the result files exist directly as a fallback
    const zipPath = path.join(outputDir, 'complete_protest_package.zip');
    const protestLetterPath = path.join(outputDir, 'protest_letter.pdf');
    const form886aPath = path.join(outputDir, 'form_886a.pdf');
    const letterTextPath = path.join(outputDir, 'protest_letter_with_attachments.txt');
    const form886aTextPath = path.join(outputDir, 'form_886a_with_attachments.txt');
    
    // Check for either protest letter or form 886-A files
    const hasPdf = fsSync.existsSync(protestLetterPath) || fsSync.existsSync(form886aPath);
    const hasZip = fsSync.existsSync(zipPath);
    const hasLetterText = fsSync.existsSync(letterTextPath) || fsSync.existsSync(form886aTextPath);
    
    if (hasZip && hasPdf && hasLetterText) {
      console.log(`Found completed files for job ${jobId}, but no status file. Creating one.`);
      
      // Determine which document type was created
      const isForm886a = fsSync.existsSync(form886aPath);
      const textPath = isForm886a ? form886aTextPath : letterTextPath;
      const pdfPath = isForm886a ? form886aPath : protestLetterPath;
      
      // Read the letter text
      let letterText = '';
      try {
        letterText = await fs.readFile(textPath, 'utf8');
      } catch (readErr) {
        console.error(`Error reading letter text: ${readErr.message}`);
      }
      
      // Get list of attachments if directory exists
      const attachments = [];
      const attachmentsDir = path.join(outputDir, 'attachments');
      if (fsSync.existsSync(attachmentsDir)) {
        try {
          const files = fsSync.readdirSync(attachmentsDir);
          files.forEach(file => {
            attachments.push({
              filename: file,
              originalUrl: 'Original URL not recorded',
              path: path.join(attachmentsDir, file)
            });
          });
        } catch (dirErr) {
          console.error(`Error reading attachments directory: ${dirErr.message}`);
        }
      }
      
      // Create and save job status
      const completedJob = {
        status: 'completed',
        progress: 100,
        result: {
          letter: letterText,
          pdfPath: pdfPath,
          zipPath: zipPath,
          attachments: attachments,
          packageFilename: path.basename(zipPath)
        }
      };
      
      // Try to save the status file for future requests
      try {
        await fs.writeFile(statusFilePath, JSON.stringify(completedJob, null, 2));
      } catch (writeErr) {
        console.error(`Error writing status file: ${writeErr.message}`);
      }
      
      // Return completed status
      return res.status(200).json({
        success: true,
        job: completedJob
      });
    } else if (fsSync.existsSync(outputDir)) {
      // Job exists but is still in progress
      console.log(`Job ${jobId} exists but is still processing`);
      
      // Check which step we're at based on existing files
      let status = 'processing_content';
      let progress = 20;
      
      const conversationPath = path.join(outputDir, 'conversation.txt');
      const letterPath = path.join(outputDir, 'protest_letter.txt') || path.join(outputDir, 'form_886a.txt');
      
      if (fsSync.existsSync(letterPath)) {
        status = 'generating_document';
        progress = 50;
      }
      
      if (hasLetterText) {
        status = 'extracting_urls';
        progress = 70;
      }
      
      if (hasPdf) {
        status = 'generating_pdf';
        progress = 85;
      }
      
      if (hasZip) {
        status = 'creating_package';
        progress = 95;
      }
      
      const inProgressJob = {
        status,
        progress,
        message: 'Job is still being processed'
      };
      
      // Try to save the status file for future requests
      try {
        await fs.writeFile(statusFilePath, JSON.stringify(inProgressJob, null, 2));
      } catch (writeErr) {
        console.error(`Error writing status file: ${writeErr.message}`);
      }
      
      return res.status(200).json({
        success: true,
        job: inProgressJob
      });
    } else {
      // Job doesn't exist or ID is invalid
      console.log(`Job directory not found for ID: ${jobId}`);
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
  } catch (error) {
    console.error('Error checking job status:', error);
    res.status(500).json({
      success: false,
      message: `Error checking job status: ${error.message}`
    });
  }
});

// Process pasted ChatGPT content directly
router.post('/process-content', async (req, res) => {
  try {
    const {
      chatGptContent,
      businessName,
      ein,
      location,
      timePeriod
    } = req.body;

    // Validate required inputs
    if (!chatGptContent) {
      return res.status(400).json({
        success: false,
        message: 'ChatGPT conversation content is required'
      });
    }
    
    if (!businessName || !ein || !timePeriod) {
      return res.status(400).json({
        success: false,
        message: 'Business name, EIN, and time period are required'
      });
    }

    console.log(`Processing ChatGPT content (${chatGptContent.length} chars)`);
    console.log(`Business: ${businessName}, Period: ${timePeriod}`);
    
    // Create unique directory for request with job ID
    const jobId = uuidv4().substring(0, 8);
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${jobId}`);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Create initial job status file
    const initialStatus = {
      status: 'processing_content',
      progress: 10,
      message: 'Starting document generation process'
    };
    
    await fs.writeFile(
      path.join(outputDir, 'job_status.json'),
      JSON.stringify(initialStatus, null, 2)
    );
    
    // Return the job ID immediately so frontend can start polling
    res.status(200).json({
      success: true,
      message: 'Document generation started',
      jobId
    });
    
    // Now continue processing asynchronously
    (async () => {
      try {
        // Update job status
        const updateStatus = async (status, progress, message) => {
          try {
            const statusData = {
              status,
              progress,
              message
            };
            await fs.writeFile(
              path.join(outputDir, 'job_status.json'),
              JSON.stringify(statusData, null, 2)
            );
            console.log(`Updated job ${jobId} status: ${status}, progress: ${progress}%`);
          } catch (statusErr) {
            console.error(`Error updating status: ${statusErr.message}`);
          }
        };
    
        // 1. Save the conversation content to a file
        await fs.writeFile(
          path.join(outputDir, 'conversation.txt'),
          chatGptContent,
          'utf8'
        );
        console.log(`Saved conversation content (${chatGptContent.length} chars)`);
        await updateStatus('processing_content', 20, 'Processing conversation content');

        // 2. Get the appropriate template based on document type
        let templateContent = await documentGenerator.getTemplateContent(req.body.documentType || 'protestLetter');
        await updateStatus('generating_document', 30, 'Generating document from template');

        // 3. Create business info object
        const businessInfo = {
          businessName: req.body.businessName,
          ein: req.body.ein,
          location: req.body.location,
          timePeriod: req.body.timePeriod,
          allTimePeriods: req.body.allTimePeriods || [req.body.timePeriod],
          businessType: req.body.businessType || 'business',
          documentType: req.body.documentType || 'protestLetter',
          // Add IRS address if provided
          irsAddress: req.body.irsAddress || '',
          // Include all quarterly revenue data
          q1_2019: req.body.q1_2019, 
          q2_2019: req.body.q2_2019, 
          q3_2019: req.body.q3_2019, 
          q4_2019: req.body.q4_2019,
          q1_2020: req.body.q1_2020, 
          q2_2020: req.body.q2_2020, 
          q3_2020: req.body.q3_2020, 
          q4_2020: req.body.q4_2020,
          q1_2021: req.body.q1_2021, 
          q2_2021: req.body.q2_2021, 
          q3_2021: req.body.q3_2021,
          // Include additional context
          revenueReductionInfo: req.body.revenueReductionInfo,
          governmentOrdersInfo: req.body.governmentOrdersInfo,
          // Include pre-calculated data if available
          revenueDeclines: req.body.revenueDeclines,
          qualifyingQuarters: req.body.qualifyingQuarters,
          // Include approach focus
          approachFocus: req.body.approachFocus || 'governmentOrders',
          // Include new parameters
          includeRevenueSection: req.body.includeRevenueSection !== false,
          includeSupplyChainDisruption: req.body.includeSupplyChainDisruption || false,
          disallowanceReason: req.body.disallowanceReason || 'no_orders',
          customDisallowanceReason: req.body.customDisallowanceReason || '',
          outputFormat: req.body.outputFormat || 'pdf'
        };

        // 4. Generate document using the conversation content and template
        // Generate the initial document
        await updateStatus('generating_document', 40, 'Analyzing conversation content');
        let document = await documentGenerator.generateERCDocument(
          businessInfo,
          chatGptContent,
          templateContent
        );
        
        // Ensure proper SOURCES section formatting
        document = documentGenerator.ensureProperSourcesFormat(document);
        await updateStatus('generating_document', 50, 'Document generation complete');
        
        // Save the generated document in text format
        const documentFileName = req.body.documentType === 'form886A' ? 'form_886a.txt' : 'protest_letter.txt';
        await fs.writeFile(
          path.join(outputDir, documentFileName),
          document,
          'utf8'
        );
        
        // 5. Process URLs in the document and download as PDFs
        console.log('Starting URL extraction and download process...');
        await updateStatus('extracting_urls', 60, 'Extracting and downloading referenced URLs');
        const { letter: updatedDocument, attachments } = await urlProcessor.extractAndDownloadUrls(
          document, 
          outputDir
        );
        
        console.log(`URL processing complete. Downloaded ${attachments.length} attachments.`);
        for (const attachment of attachments) {
          console.log(`- ${attachment.filename} (from ${attachment.originalUrl})`);
        }
        await updateStatus('generating_pdf', 70, 'URLs processed, generating documents');
        
        // Save the updated document with attachment references
        const updatedFileName = req.body.documentType === 'form886A' ? 'form_886a_with_attachments.txt' : 'protest_letter_with_attachments.txt';
        await fs.writeFile(
          path.join(outputDir, updatedFileName),
          updatedDocument,
          'utf8'
        );
        
        // 6. Generate PDF version of the document
        const pdfFileName = req.body.documentType === 'form886A' ? 'form_886a.pdf' : 'protest_letter.pdf';
        const pdfPath = path.join(outputDir, pdfFileName);
        await pdfGenerator.generatePdf(updatedDocument, pdfPath);
        await updateStatus('generating_pdf', 80, 'PDF generation complete');
        
        // 7. Generate DOCX version if requested
        let docxPath = null;
        if (req.body.outputFormat === 'docx') {
          const docxFileName = req.body.documentType === 'form886A' ? 'form_886a.docx' : 'protest_letter.docx';
          docxPath = path.join(outputDir, docxFileName);
          await documentGenerator.generateDocx(updatedDocument, docxPath);
          await updateStatus('generating_docx', 85, 'DOCX generation complete');
        }
        
        // 8. Create a complete package as a ZIP file
        await updateStatus('creating_package', 90, 'Creating complete package with attachments');
        const packageName = req.body.documentType === 'form886A' ? 'form_886a_package.zip' : 'complete_protest_package.zip';
        const zipPath = path.join(outputDir, packageName);
        
        console.log(`Creating package with ${attachments.length} attachments`);
        // Use the correct format when creating the package
        await packageCreator.createPackage(
          req.body.outputFormat === 'docx' ? docxPath : pdfPath, 
          attachments, 
          zipPath, 
          req.body.documentType,
          req.body.outputFormat
        );
        await updateStatus('uploading', 95, 'Package created, finalizing process');
        
        // 9. Upload to Google Drive if tracking ID is provided
        let driveUrls = null;
        if (req.body.trackingId) {
          try {
            console.log(`Tracking ID provided: ${req.body.trackingId}, uploading to Google Drive...`);
            driveUrls = await protestDriveUploader.uploadToGoogleDrive(
              req.body.trackingId,
              req.body.businessName,
              pdfPath,
              zipPath,
              docxPath
            );
            console.log(`Upload complete. Drive URLs:`, driveUrls);
          } catch (driveError) {
            console.error('Error uploading to Google Drive:', driveError);
            // Continue anyway, this shouldn't fail the whole request
          }
        }

        // 10. Create final result object for the status file
        const result = {
          outputPath: outputDir,
          letter: updatedDocument,
          pdfPath: pdfPath,
          docxPath,
          attachments,
          zipPath,
          packageFilename: path.basename(zipPath)
        };
        
        // Add Google Drive URLs if available
        if (driveUrls) {
          result.googleDriveLink = driveUrls.folderLink;
          result.protestLetterLink = driveUrls.protestLetterLink;
          result.zipPackageLink = driveUrls.zipPackageLink;
        }
        
        // Update job status to completed with the result
        const finalStatus = {
          status: 'completed',
          progress: 100,
          result
        };
        
        await fs.writeFile(
          path.join(outputDir, 'job_status.json'),
          JSON.stringify(finalStatus, null, 2)
        );
        
        console.log(`Job ${jobId} completed successfully!`);

      } catch (processingError) {
        console.error('Error during document generation:', processingError);
        
        // Update job status to failed
        try {
          const failedStatus = {
            status: 'failed',
            error: processingError.message || 'Unknown error occurred during processing'
          };
          
          await fs.writeFile(
            path.join(outputDir, 'job_status.json'),
            JSON.stringify(failedStatus, null, 2)
          );
        } catch (statusErr) {
          console.error('Error updating failed status:', statusErr);
        }
      }
    })();
    
  } catch (error) {
    console.error('Critical error in document processing:', error);
    res.status(500).json({
      success: false,
      message: `Critical error: ${error.message}`
    });
  }
});

module.exports = router;