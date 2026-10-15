const mongoose = require('mongoose');

const connectDB = async (mongoUri) => {
  try {
    await mongoose.connect(mongoUri);
    return mongoose.connection;
  } catch (error) {
    throw new Error('Unable to connect to MongoDB');
  }
};

module.exports = connectDB;
