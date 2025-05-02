// server/db-connection.js

const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
      // Remove strict: false from here - it's not a valid connection option
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    return false;
  }
};

// Define submission schema with revenue fields explicitly included
const submissionSchema = new mongoose.Schema({
  submissionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  businessName: {
    type: String,
    required: true
  },
  ein: String,
  location: String,
  businessWebsite: String,
  naicsCode: String,
  timePeriods: [String],
  status: {
    type: String,
    default: 'Gathering data',
    enum: ['Gathering data', 'LLM pass #1 complete', 'Links verified', 'PDF done', 'mailed']
  },
  // Explicitly add all revenue fields to the schema
  q1_2019: String,
  q2_2019: String,
  q3_2019: String,
  q4_2019: String,
  q1_2020: String,
  q2_2020: String,
  q3_2020: String,
  q4_2020: String,
  q1_2021: String,
  q2_2021: String,
  q3_2021: String,
  // Keep submissionData for other properties
  submissionData: {
    type: Object,
    default: {}
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { strict: false }); // Set strict: false at the schema level

// Update the lastUpdated field before each save
submissionSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Create the model if it doesn't exist
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

module.exports = {
  connectDB,
  Submission
};