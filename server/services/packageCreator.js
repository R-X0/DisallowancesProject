// server/services/packageCreator.js

const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

/**
 * Create a complete package ZIP file with all document components
 * @param {string} documentPath - Path to the main document (PDF or DOCX)
 * @param {Array} attachments - Array of attachment objects
 * @param {string} zipPath - Path where to save the ZIP file
 * @param {string} documentType - Type of document (protestLetter or form886A)
 * @param {string} outputFormat - Format of the main document (pdf or docx)
 * @returns {string} - Path to the created ZIP file
 */
async function createPackage(documentPath, attachments, zipPath, documentType, outputFormat = 'pdf') {
  try {
    console.log(`Creating package at ${zipPath} with main document from ${documentPath}`);
    console.log(`Document format: ${outputFormat}`);
    console.log(`Attachments to include: ${attachments.length}`);
    
    // Create ZIP archive
    const zip = new AdmZip();
    
    // Add the main document (PDF or DOCX) with verification
    if (!documentPath) {
      throw new Error(`No document path provided for ${outputFormat} document`);
    }
    
    // Check if the document exists
    if (!fs.existsSync(documentPath)) {
      console.log(`Document not found at ${documentPath}, waiting 2 seconds...`);
      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!fs.existsSync(documentPath)) {
        // If DOCX isn't available, try falling back to PDF
        if (outputFormat === 'docx') {
          const pdfPath = documentPath.replace(/\.docx$/i, '.pdf');
          console.log(`DOCX not found, checking for PDF at: ${pdfPath}`);
          
          if (fs.existsSync(pdfPath)) {
            console.log(`Found PDF instead, using: ${pdfPath}`);
            documentPath = pdfPath;
            outputFormat = 'pdf';
          } else {
            throw new Error(`Document file not found at ${documentPath} and no PDF fallback available`);
          }
        } else {
          throw new Error(`Document file not found at ${documentPath}`);
        }
      }
    }
    
    // Get file stats for logging
    const stats = fs.statSync(documentPath);
    console.log(`Adding document to package: ${documentPath} (${stats.size} bytes)`);
    
    // Create main directory for clarity
    const mainDocumentName = path.basename(documentPath);
    
    // Now add the document to the ZIP
    zip.addLocalFile(documentPath);
    console.log(`Added main document to package: ${mainDocumentName}`);
    
    // Create attachments directory in the ZIP if there are attachments
    if (attachments && attachments.length > 0) {
      console.log('Creating "attachments" directory in the ZIP');
      zip.addFile('attachments/', Buffer.alloc(0));
    }
    
    // Add all attachment PDFs with verification
    let addedAttachments = 0;
    for (const attachment of attachments) {
      if (!attachment || !attachment.path) {
        console.log(`Skipping invalid attachment entry`);
        continue;
      }
      
      if (!fs.existsSync(attachment.path)) {
        console.log(`Attachment not found: ${attachment.path}, skipping...`);
        continue;
      }
      
      try {
        // Get file stats for logging
        const attachStats = fs.statSync(attachment.path);
        if (attachStats.size === 0) {
          console.log(`Attachment file is empty, skipping: ${attachment.path}`);
          continue;
        }
        
        console.log(`Adding attachment to package: ${attachment.filename} (${attachStats.size} bytes)`);
        
        // Add the attachment to the "attachments" directory
        const zipPath = `attachments/${attachment.filename}`;
        zip.addLocalFile(attachment.path, 'attachments');
        addedAttachments++;
      } catch (attachError) {
        console.log(`Error adding attachment ${attachment.filename}: ${attachError.message}`);
      }
    }
    console.log(`Successfully added ${addedAttachments} attachments to package`);
    
    // Create README content based on document type and format
    const docFileName = path.basename(documentPath);
    const formatDisplay = outputFormat.toUpperCase();
    const readmeContent = documentType === 'form886A' 
      ? `ERC FORM 886-A PACKAGE

Main Document:
- ${docFileName} (The main Form 886-A document in ${formatDisplay} format)

Attachments (${addedAttachments} total):
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`
      : `ERC PROTEST PACKAGE

Main Document:
- ${docFileName} (The main protest letter in ${formatDisplay} format)

Attachments (${addedAttachments} total):
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`;
    
    // Add README file
    zip.addFile('README.txt', Buffer.from(readmeContent));
    console.log('Added README.txt to package');
    
    // Create a manifest listing all contents
    const manifestContent = `PACKAGE MANIFEST:

1. Main Document:
   - ${docFileName}

2. Attachments (${addedAttachments} files in /attachments directory):
${attachments.map((a, i) => `   ${i+1}. ${a.filename}`).join('\n')}

3. Documentation:
   - README.txt

Generated: ${new Date().toISOString()}`;

    zip.addFile('MANIFEST.txt', Buffer.from(manifestContent));
    console.log('Added MANIFEST.txt to package');
    
    // Write the ZIP file
    console.log(`Writing ZIP package to: ${zipPath}`);
    zip.writeZip(zipPath);
    
    // Verify the ZIP was created and has content
    if (fs.existsSync(zipPath)) {
      const zipStats = fs.statSync(zipPath);
      console.log(`ZIP package created successfully: ${zipPath} (${zipStats.size} bytes)`);
    } else {
      throw new Error(`Failed to create ZIP package at ${zipPath}`);
    }
    
    return zipPath;
  } catch (error) {
    console.error('Error creating package:', error);
    throw new Error(`Failed to create package: ${error.message}`);
  }
}

module.exports = {
  createPackage
};