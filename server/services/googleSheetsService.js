// server/services/googleSheetsService.js
const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.initialized = false;
    this.sheets = null;
    
    // Get spreadsheet ID from environment variable
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    console.log('GoogleSheetsService constructor - Using spreadsheetId:', this.spreadsheetId || 'Not set yet (will check during initialization)');
  }

  async initialize() {
    try {
      console.log('Initializing Google Sheets service...');
      
      const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../config/google-credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      
      const client = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: client });
      
      // Double-check spreadsheet ID is set - use fallback only if not set in env vars
      if (!this.spreadsheetId) {
        console.log('No spreadsheetId found in env vars, using fallback value');
        this.spreadsheetId = '13zhAc2uKW5DOyW_LJuDiUxA7gV3rD_9yLFTveW9aRtM';
      }
      
      this.initialized = true;
      console.log('Google Sheets service initialized successfully with spreadsheetId:', this.spreadsheetId);
      
      // Ensure headers exist on initialization
      await this.ensureHeadersExist();
    } catch (error) {
      console.error('Failed to initialize Google Sheets service:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Make sure the sheet has the correct headers
  async ensureHeadersExist() {
    try {
      // Check if headers already exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A1:N1',
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        // No headers, add them
        console.log("No headers found, adding headers row");
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: 'ERC Tracking!A1:N1',
          valueInputOption: 'RAW',
          resource: {
            values: [[
              "Tracking ID", 
              "Business Name", 
              "EIN", 
              "Location", 
              "Business Website", 
              "NAICS Code", 
              "Time Period", 
              "Additional Info", 
              "Status", 
              "Timestamp", 
              "Protest Letter Path", 
              "ZIP Path", 
              "Tracking Number", 
              "Google Drive Link"
            ]]
          }
        });
        console.log("Headers added successfully");
      } else {
        // Headers exist but might need updating
        const headers = response.data.values[0];
        if (headers.length < 14) {
          console.log("Headers row exists but is incomplete, updating headers");
          // Missing some headers, update them
          const completeHeaders = [
            "Tracking ID", 
            "Business Name", 
            "EIN", 
            "Location", 
            "Business Website", 
            "NAICS Code", 
            "Time Period", 
            "Additional Info", 
            "Status", 
            "Timestamp", 
            "Protest Letter Path", 
            "ZIP Path", 
            "Tracking Number", 
            "Google Drive Link"
          ];
          
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: 'ERC Tracking!A1:N1',
            valueInputOption: 'RAW',
            resource: { values: [completeHeaders] }
          });
          console.log("Headers updated successfully");
        }
      }
    } catch (error) {
      console.error("Error ensuring headers exist:", error);
      // Continue anyway, this shouldn't block the main operation
    }
  }

  async addSubmission(submissionData) {
    await this.ensureInitialized();
    
    const {
      trackingId,
      businessName,
      ein,                  // Added fields
      location,             
      businessWebsite,      
      naicsCode,            
      timePeriod,
      additionalInfo,       // Added field
      status = 'Gathering data',
      timestamp = new Date().toISOString(),
      protestLetterPath = '',
      zipPath = '',
      trackingNumber = '',
      googleDriveLink = ''
    } = submissionData;

    try {
      console.log('Adding submission to Google Sheet with ID:', this.spreadsheetId);
      console.log('Adding data:', { trackingId, businessName, ein, location, timePeriod });
      
      // First, check if the header row exists, and create it if not
      await this.ensureHeadersExist();
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A:N', // Expanded range to include all fields
        valueInputOption: 'RAW',
        resource: {
          values: [
            [
              trackingId,
              businessName,
              ein,                // Added
              location,           // Added
              businessWebsite,    // Added
              naicsCode,          // Added
              timePeriod,
              additionalInfo,     // Added
              status,
              timestamp,
              protestLetterPath,
              zipPath,
              trackingNumber,
              googleDriveLink     // Make sure this is in the last column
            ]
          ]
        }
      });

      console.log('Added submission to Google Sheet:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error adding submission to Google Sheet:', error);
      
      // Retry once with sheet initialization
      try {
        console.log('Retrying with sheet initialization...');
        await this.initialize();
        
        const response = await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: 'ERC Tracking!A:N', // Expanded range
          valueInputOption: 'RAW',
          resource: {
            values: [
              [
                trackingId,
                businessName,
                ein,
                location,
                businessWebsite,
                naicsCode,
                timePeriod,
                additionalInfo,
                status,
                timestamp,
                protestLetterPath,
                zipPath,
                trackingNumber,
                googleDriveLink
              ]
            ]
          }
        });
        
        console.log('Added submission to Google Sheet on retry:', response.data);
        return response.data;
      } catch (retryError) {
        console.error('Error adding submission to Google Sheet after retry:', retryError);
        throw retryError;
      }
    }
  }

  async updateSubmission(trackingId, updateData) {
    await this.ensureInitialized();
    
    try {
      console.log(`Attempting to update Google Sheet for tracking ID: ${trackingId}`);
      
      // First, find the row with the matching tracking ID - with enhanced ID handling
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A:A',
      });
      
      const rows = response.data.values || [];
      let rowIndex = -1;
      
      // Try finding the tracking ID in various formats
      const possibleFormats = [
        trackingId,                             // Original format
        trackingId.toString(),                  // As string
        `ERC-${trackingId.replace(/^ERC-/, '')}`, // With ERC- prefix
        trackingId.replace(/^ERC-/, '')         // Without ERC- prefix
      ];
      
      console.log(`Looking for tracking ID in formats: ${possibleFormats.join(', ')}`);
      
      // Find the first row that matches any of the possible formats
      for (let i = 0; i < rows.length; i++) {
        const cellValue = rows[i][0];
        if (cellValue && possibleFormats.includes(cellValue)) {
          rowIndex = i + 1; // +1 because sheets are 1-indexed
          console.log(`Found match at row ${rowIndex} with value "${cellValue}"`);
          break;
        }
      }
      
      // If not found, try a more flexible approach
      if (rowIndex === -1) {
        console.log('No exact match found, trying partial match...');
        
        const baseId = trackingId.replace(/^ERC-/, '');
        
        for (let i = 0; i < rows.length; i++) {
          const cellValue = (rows[i][0] || '').toString();
          
          // Check if the row contains this ID in any form
          if (
            cellValue.includes(trackingId) || 
            cellValue.includes(baseId) ||
            trackingId.includes(cellValue) ||
            baseId.includes(cellValue)
          ) {
            rowIndex = i + 1;
            console.log(`Found partial match at row ${rowIndex} with value "${cellValue}"`);
            break;
          }
        }
      }
      
      // If still not found, we need to add it rather than update
      if (rowIndex === -1) {
        console.log(`No row found for tracking ID ${trackingId}, will add new row instead`);
        
        // Get the minimum required data for a new row
        const { 
          status = 'Processing',
          timestamp = new Date().toISOString(),
          protestLetterPath = '',
          zipPath = '',
          trackingNumber = '',
          googleDriveLink = '',
          businessName = 'Unknown Business'
        } = updateData;
        
        // Try to get more details from updateData or use placeholders
        const addData = {
          trackingId: trackingId,
          businessName: businessName || updateData.businessName || 'Unknown Business',
          ein: updateData.ein || '00-0000000',
          location: updateData.location || 'Unknown Location',
          businessWebsite: updateData.businessWebsite || '',
          naicsCode: updateData.naicsCode || '',
          timePeriod: updateData.timePeriod || 'Unknown',
          additionalInfo: updateData.additionalInfo || '',
          status,
          timestamp,
          protestLetterPath,
          zipPath,
          trackingNumber,
          googleDriveLink
        };
        
        // Add the new row instead
        await this.addSubmission(addData);
        console.log(`Added new row for tracking ID ${trackingId} instead of updating`);
        return { success: true, action: 'added' };
      }
      
      console.log(`Found submission ${trackingId} at row ${rowIndex}, updating...`);
      
      // Create update batches for cleaner code
      const updateBatches = [];
      
      const {
        status,
        timestamp = new Date().toISOString(),
        protestLetterPath,
        zipPath,
        trackingNumber,
        googleDriveLink
      } = updateData;
  
      // Log the update data for debugging
      console.log('Updating submission with data:', {
        status,
        timestamp,
        protestLetterPath,
        zipPath,
        trackingNumber,
        googleDriveLink
      });
      
      // Create update data, only including fields that are provided
      if (status !== undefined) {
        // Status is now in column I (index 8)
        updateBatches.push({
          range: `ERC Tracking!I${rowIndex}`,
          values: [[status]]
        });
      }
      
      // Always update timestamp (now column J)
      updateBatches.push({
        range: `ERC Tracking!J${rowIndex}`,
        values: [[timestamp]]
      });
      
      if (protestLetterPath !== undefined) {
        // Protest Letter Path is now column K
        updateBatches.push({
          range: `ERC Tracking!K${rowIndex}`,
          values: [[protestLetterPath]]
        });
      }
      
      if (zipPath !== undefined) {
        // ZIP Path is now column L
        updateBatches.push({
          range: `ERC Tracking!L${rowIndex}`,
          values: [[zipPath]]
        });
      }
      
      if (trackingNumber !== undefined) {
        // Tracking Number is now column M
        updateBatches.push({
          range: `ERC Tracking!M${rowIndex}`,
          values: [[trackingNumber]]
        });
      }
      
      if (googleDriveLink !== undefined) {
        // Google Drive Link is now column N
        updateBatches.push({
          range: `ERC Tracking!N${rowIndex}`,
          values: [[googleDriveLink]]
        });
      }
      
      // Execute all updates in one batch
      if (updateBatches.length > 0) {
        console.log(`Executing ${updateBatches.length} update batches for row ${rowIndex}`);
        
        try {
          // Use batchUpdate for efficiency if multiple fields are updated
          if (updateBatches.length > 1) {
            const batchRequest = {
              spreadsheetId: this.spreadsheetId,
              resource: {
                valueInputOption: 'RAW',
                data: updateBatches
              }
            };
            
            await this.sheets.spreadsheets.values.batchUpdate(batchRequest);
          } else {
            // Use single update for just one field
            const singleUpdate = updateBatches[0];
            await this.sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: singleUpdate.range,
              valueInputOption: 'RAW',
              resource: { values: singleUpdate.values },
            });
          }
          
          console.log(`Updated submission ${trackingId} in Google Sheet successfully`);
        } catch (updateError) {
          console.error(`Error during Sheet update operation:`, updateError);
          throw updateError;
        }
      } else {
        console.log(`No fields to update for ${trackingId}`);
      }
      
      return { success: true, rowIndex, action: 'updated' };
    } catch (error) {
      console.error(`Error updating submission ${trackingId} in Google Sheet:`, error);
      
      // Add more context to the error for easier debugging
      const enhancedError = new Error(`Failed to update Google Sheet for ${trackingId}: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async getAllSubmissions() {
    await this.ensureInitialized();
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A2:N', // Update to include all columns
      });
      
      const rows = response.data.values || [];
      
      const submissions = rows.map(row => {
        // Ensure we have at least the required fields
        while (row.length < 14) row.push('');
        
        return {
          trackingId: row[0] || '',
          businessName: row[1] || '',
          ein: row[2] || '',
          location: row[3] || '',
          businessWebsite: row[4] || '',
          naicsCode: row[5] || '',
          timePeriod: row[6] || '',
          additionalInfo: row[7] || '',
          status: row[8] || '',
          timestamp: row[9] || '',
          protestLetterPath: row[10] || '',
          zipPath: row[11] || '',
          trackingNumber: row[12] || '',
          googleDriveLink: row[13] || ''
        };
      });
      
      return submissions;
    } catch (error) {
      console.error('Error fetching submissions from Google Sheet:', error);
      throw error;
    }
  }
}

// Singleton instance
const sheetsService = new GoogleSheetsService();

module.exports = sheetsService;