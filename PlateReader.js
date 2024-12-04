// Import AWS SDK clients for S3, Rekognition, SQS, and EventBridge
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, DetectTextCommand } from "@aws-sdk/client-rekognition";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

// Initialize AWS clients
const s3Client = new S3Client({ region: "us-east-1" });
const sqsClient = new SQSClient({ region: "us-east-1" });
const rekognitionClient = new RekognitionClient({ region: "us-east-1" });
const eventBridgeClient = new EventBridgeClient({ region: "us-east-1" });

// Queue URL and EventBridge bus name constants for later use
const DOWNWARD_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/662724091479/P3DownwardQueue.fifo";
const EVENT_BUS_NAME = "nonCaliPlate"; 

// The main handler function for the Lambda function
export const handler = async (event) => {
    let key; // Variable to store the S3 object key

    try {
        // Validate event format
        if (!event.Records || event.Records.length === 0) {
            throw new Error("No S3 event records found");
        }

        // Extract bucket name and object key from the event
        const s3Event = event.Records[0].s3;
        const bucket = s3Event.bucket.name;
        key = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

        // Prepare parameters to retrieve the object from S3
        const getObjectParams = {
            Bucket: bucket,
            Key: key,
        };
        // Retrieve the object to access its metadata
        const { Metadata } = await s3Client.send(new GetObjectCommand(getObjectParams));
        // Extracting metadata
        const violation = Metadata.violation;
        const time = Metadata.time; // Extract the time metadata
        const location = Metadata.location; // Extract the location metadata

        // Detect text in the image using AWS Rekognition
        const detectTextParams = {
            Image: {
                S3Object: {
                    Bucket: bucket,
                    Name: key,
                },
            },
        };
        // Detect text in the image using Rekognition
        const textData = await rekognitionClient.send(new DetectTextCommand(detectTextParams));
        // Extract license plate information from the detected text
        const licensePlateInfo = extractLicensePlateInfo(textData.TextDetections);

        // Include the violation metadata in the message body or event detail
        const messageDetail = {
            imageKey: key, 
            licensePlate: licensePlateInfo.plateNumber, 
            violation: violation, // Include violation in the detail
            time: time, // Include time in the detail
            location: location // Include location in the detail
        };

        // Route the message to the appropriate AWS service based on the license plate's origin
        if (licensePlateInfo.isCalifornia) {
            // If the plate is from California, send the message to an SQS queue
            await sendMessageToSQSQueue(DOWNWARD_QUEUE_URL, messageDetail);
        } else {
            // If the plate is NOT from California, send the event to EventBridge
            await sendEventToEventBridge(EVENT_BUS_NAME, messageDetail);
        }
    } catch (error) {
        // Log any errors that occur during processing
        console.error(`Error processing file: ${key ? key : 'unknown'}`, error);
        throw error;
    }
};

// Helper function to extract license plate info
function extractLicensePlateInfo(textDetections) {
    // Define a regular expression pattern for California license plates
    const caPlatePattern = /^[0-9][A-Z]{3}[0-9]{3}$/;
    let plateNumber = '';
    let isCalifornia = false;

    for (let detection of textDetections) {
        // Normalize detected text for matching
        const detectedText = detection.DetectedText.toUpperCase().replace(/\s+/g, ''); // Remove spaces and convert to uppercase for matching
        // Check if the detected text matches the California license plate pattern
        if (caPlatePattern.test(detectedText)) {
            plateNumber = detectedText;
            isCalifornia = true;
            break; // Exit loop once a matching license plate is found
        }
    }

    return { plateNumber, isCalifornia };
}

// Sends a message to the specified SQS queue
async function sendMessageToSQSQueue(queueUrl, messageBody) {
    // Set up the SendMessage command with the message details
    const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),
        MessageGroupId: 'defaultGroup', // This is necessary for FIFO queues
        MessageDeduplicationId: generateDeduplicationId(messageBody), // Generate a deduplication ID
    });

    try {
        const response = await sqsClient.send(command);
        console.log("SQS send message response:", JSON.stringify(response));
    } catch (error) {
        console.error("Error sending message to SQS:", error);
    }
}

// Generate a deduplication ID for the SQS message
function generateDeduplicationId(messageBody) {
    // Use license plate and current timestamp to generate a unique ID
    return `${messageBody.licensePlate}-${Date.now()}`;
}

// Sends an event to the specified EventBridge bus
async function sendEventToEventBridge(busName, detail) {
    // Configure the PutEvents command with event details
    const command = new PutEventsCommand({
        Entries: [{
            EventBusName: busName,
            Source: 'custom.imageProcessing',
            DetailType: 'Image Processed',
            Detail: JSON.stringify(detail),
        }],
    });

    try {
        const response = await eventBridgeClient.send(command);
        console.log("EventBridge send event response:", JSON.stringify(response));
    } catch (error) {
        console.error("Error sending event to EventBridge:", error);
    }
}