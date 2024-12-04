// Importing necessary modules from AWS SDK v3 for S3 operations, and Node.js filesystem and path modules for file handling
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');

// Initialize S3Client for the specified AWS region
const s3Client = new S3Client({ region: "us-east-1" });

// Helper function to generate a random date within the last 30 days
function getRandomDate() {
    const today = new Date();
    const thirtyDaysAgo = new Date().setDate(today.getDate() - 30);
    const randomTime = new Date(thirtyDaysAgo + Math.random() * (today - thirtyDaysAgo));
    return randomTime.toISOString();
}

// Function to upload a file to an S3 bucket
async function uploadFile(filePath) {
    // Read the content of the file to be uploaded
    const fileContent = fs.readFileSync(filePath);

    // Ensure the file is a JPEG image
    if (!filePath.endsWith('.jpg')) {
        console.log("Error: Only JPG files are supported.");
        return;
    }

    // Generate a random violation from the list
    const violations = ['no_stop', 'no_full_stop_on_right', 'no_right_on_red'];
    const randomViolation = violations[Math.floor(Math.random() * violations.length)];

    // Locations list
    const locations = [
        "Main St and 116th AVE intersection, Bellevue",
        "2nd St and 117th AVE intersection, Seattle",
        "4th St and 108th AVE intersection, Renton"
    ];
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];

    // Generate a random date
    const randomDate = getRandomDate();

    // Set up parameters for S3 upload, including bucket name, file name, content, and content type for the image
    const params = {
        Bucket: 'p3-dmv-license',
        Key: path.basename(filePath), // File name you want to save as in S3
        Body: fileContent,
        ContentType: 'image/jpeg', // Setting content type for image files
        Metadata: {
            violation: randomViolation, // Attach the randomized violation as metadata
            time: randomDate, // Random time
            location: randomLocation // Random location
        }
    };

    try {
        // Uploading files to the bucket
        const data = await s3Client.send(new PutObjectCommand(params));
        console.log(`File uploaded successfully. ${data.Location}`);
    } catch (err) {
        console.error("Error:", err);
    }
}

// Main function to handle command-line arguments and initiate file upload
async function main() {
    const args = process.argv.slice(2);

    if (args.length !== 1) {
        console.log("Usage: node UploadData.js <file_path>");
        return;
    }

    const filePath = args[0];

    // Call uploadFile with the provided arguments
    await uploadFile(filePath);
}

// Invoke main
main();
